// crm-tools — rota segura para executar qualquer tool do TOOL_REGISTRY compartilhado.
// Autentica o usuário via JWT, aplica escopo/RLS, valida args mínimos e devolve envelope.
// Uso: POST { tool: "get_top_products", args: {...} }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveTool, TOOL_REGISTRY, type CrmCtx } from "../_shared/crm-handlers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "Não autenticado" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "Sessão inválida" }, 401);
  const userId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido" }, 400); }
  const toolName = String(body?.tool ?? "").trim();
  if (!toolName) return json({ ok: false, error: "Parâmetro 'tool' obrigatório" }, 400);

  const tool = resolveTool(toolName);
  if (!tool) return json({ ok: false, error: `Tool desconhecida: ${toolName}` }, 404);

  // Perfil (para escopo team vs own)
  const { data: profile } = await supabase.from("profiles").select("full_name, role, company_id").eq("user_id", userId).maybeSingle();

  const ctx: CrmCtx = { supabase, userId, profile: profile ?? null, companyId: profile?.company_id ?? null };
  const args = body?.args ?? {};
  const t0 = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const result = await tool.handler(ctx, args);
    const duration = Date.now() - t0;
    const includeDiagnostics = profile?.role === "admin" || profile?.role === "gestor" || body?.diagnostics === true;
    const diagnostics = includeDiagnostics ? {
      tool: tool.name,
      request_id: requestId,
      args,
      duration_ms: duration,
      row_count: Array.isArray((result as any).rows) ? (result as any).rows.length : ((result as any).count ?? null),
      generated_at: new Date().toISOString(),
    } : undefined;
    return json({ ...result, diagnostics });
  } catch (e: any) {
    console.error("[crm-tools] error", toolName, e);
    return json({ ok: false, entity: "error", error: e?.message ?? "Erro na execução", diagnostics: { tool: toolName, request_id: requestId, duration_ms: Date.now() - t0 } }, 500);
  }
});

// Marker: tools disponíveis são as do TOOL_REGISTRY compartilhado.
void TOOL_REGISTRY;
