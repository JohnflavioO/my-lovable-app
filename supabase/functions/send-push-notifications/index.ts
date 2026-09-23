// send-push-notifications
// Modes:
//   action="scan_followups" -> varre follow-ups vencidos e cria notif interna + push
//   action="send_push"      -> envia push FCM v1 para o usuário indicado
//
// Isolamento: notificações de follow-up são criadas dentro do company_id do vendedor.
// Push é enviado apenas para tokens cujo company_id bate com o do destinatário (quando definido).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isDev = (Deno.env.get("ENVIRONMENT") ?? "production").toLowerCase() !== "production";
const log = {
  debug: (...a: unknown[]) => { if (isDev) console.log(...a); },
  warn:  (...a: unknown[]) => console.warn(...a),
  error: (...a: unknown[]) => console.error(...a),
};

interface PushNotification {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

function validatePush(input: unknown): { ok: true; value: PushNotification } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "notification missing" };
  const n = input as Record<string, unknown>;
  if (typeof n.userId !== "string" || !n.userId) return { ok: false, error: "userId required" };
  if (typeof n.title !== "string" || !n.title) return { ok: false, error: "title required" };
  if (typeof n.body !== "string") return { ok: false, error: "body required" };
  if (n.data && (typeof n.data !== "object" || Array.isArray(n.data))) return { ok: false, error: "data must be object" };
  return { ok: true, value: n as unknown as PushNotification };
}

// ===== Google OAuth (Service Account JWT) =====
let cachedToken: { token: string; exp: number } | null = null;
let cachedProjectId: string | null = null;

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
                  .replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) return null;
  let sa: any;
  try { sa = JSON.parse(raw); } catch { log.error("FIREBASE_SERVICE_ACCOUNT inválido"); return null; }
  cachedProjectId = sa.project_id;

  if (cachedToken && Date.now() < cachedToken.exp - 60_000) {
    return { token: cachedToken.token, projectId: cachedProjectId! };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) { log.error("OAuth Google falhou:", json); return null; }
  cachedToken = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return { token: cachedToken.token, projectId: sa.project_id };
}

async function sendFcm(token: string, n: PushNotification): Promise<{ ok: boolean; error?: string; invalid?: boolean }> {
  const auth = await getAccessToken();
  if (!auth) {
    log.debug(`[push:log] ${n.title} -> ${token.slice(0, 12)}… (sem FIREBASE_SERVICE_ACCOUNT)`);
    return { ok: false, error: "no_service_account" };
  }

  const message = {
    message: {
      token,
      notification: { title: n.title, body: n.body },
      data: n.data ? Object.fromEntries(Object.entries(n.data).map(([k, v]) => [k, String(v)])) : undefined,
      webpush: { fcm_options: n.data?.url ? { link: n.data.url } : undefined },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`,
    { method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" }, body: JSON.stringify(message) },
  );
  const text = await res.text();
  if (res.ok) return { ok: true };
  let invalid = false;
  try {
    const j = JSON.parse(text);
    const status = j?.error?.status || "";
    if (status === "NOT_FOUND" || status === "INVALID_ARGUMENT" || status === "UNREGISTERED") invalid = true;
  } catch { /* ignore */ }
  log.error("FCM erro:", res.status, text);
  return { ok: false, error: text, invalid };
}

async function sendPushToUser(supabase: any, n: PushNotification): Promise<{ sent: number; failed: number }> {
  // Respeita preferência do usuário (sino interno desligado = sem push)
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("notifications_enabled")
    .eq("user_id", n.userId).maybeSingle();
  if (prefs && prefs.notifications_enabled === false) {
    log.debug(`[push] user ${n.userId} desabilitou notificações`);
    return { sent: 0, failed: 0 };
  }

  // company_id do destinatário (para escopo)
  const { data: profile } = await supabase
    .from("profiles").select("company_id").eq("user_id", n.userId).maybeSingle();
  const recipientCompany = profile?.company_id ?? null;

  let q = supabase.from("user_push_tokens")
    .select("id, fcm_token, company_id")
    .eq("user_id", n.userId).eq("is_active", true);
  const { data: tokens } = await q;
  if (!tokens?.length) return { sent: 0, failed: 0 };

  // Se o usuário tem company_id, filtra tokens compatíveis (tolera tokens antigos sem company_id)
  const filtered = recipientCompany
    ? tokens.filter((t: any) => !t.company_id || t.company_id === recipientCompany)
    : tokens;

  let sent = 0, failed = 0;
  for (const t of filtered) {
    const r = await sendFcm(t.fcm_token, n);
    if (r.ok) sent++;
    else {
      failed++;
      if (r.invalid) {
        await supabase.from("user_push_tokens").update({ is_active: false }).eq("id", t.id);
      }
    }
  }
  return { sent, failed };
}

async function handleScanFollowups(supabase: any) {
  const today = new Date().toISOString().split("T")[0];
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, quote_number, client_name, salesperson_id, followup_date, status, company_id")
    .in("status", ["Contato Feito", "Proposta Enviada", "Pré-venda", "Em Negociação", "Lançamento Rápido"])
    .not("followup_date", "is", null)
    .lte("followup_date", today);
  if (error) throw error;

  let pushCount = 0;
  for (const q of quotes ?? []) {
    if (!q.salesperson_id) continue;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id").eq("user_id", q.salesperson_id)
      .eq("related_quote_id", q.id).eq("type", "followup_push")
      .gte("created_at", today).maybeSingle();
    if (existing) continue;

    const overdue = new Date(q.followup_date).toISOString().split("T")[0] < today;
    const title = overdue ? "⚠️ Follow-up Vencido" : "📅 Follow-up para Hoje";
    const body = `O orçamento ${q.quote_number} de ${q.client_name} precisa de atenção.`;
    await supabase.from("notifications").insert({
      user_id: q.salesperson_id, title, message: body, type: "followup_push",
      related_quote_id: q.id, is_read: false, module: "orcamentos",
      related_url: `/quotes?id=${q.id}`, company_id: q.company_id ?? null,
    });
    await sendPushToUser(supabase, {
      userId: q.salesperson_id, title, body,
      data: { url: `/quotes?id=${q.id}`, quoteId: q.id },
    });
    pushCount++;
  }
  return new Response(JSON.stringify({ success: true, pushes_sent: pushCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const body = await req.json();
    const { action } = body;

    if (action === "scan_followups") return await handleScanFollowups(supabase);

    if (action === "send_push") {
      const v = validatePush(body.notification);
      if (!v.ok) {
        return new Response(JSON.stringify({ error: v.error }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await sendPushToUser(supabase, v.value);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    log.error("send-push-notifications erro:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
