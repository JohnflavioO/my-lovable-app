// Preços da Loja Integrada → CRM (separada da sincronização de pedidos).
// Esta função SÓ LÊ a loja e grava o retrato em li_price_snapshot / li_categories.
// A alteração do preço do produto acontece apenas por apply_li_prices (banco),
// depois que a pessoa revisa e escolhe na tela.
//
// Ações:
//   refresh_categories            → baixa as categorias da loja
//   refresh_prices {offset,limit} → baixa De/Por/categorias dos produtos vinculados, em lotes
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { identifyCaller } from "../_shared/callerAuth.ts";

const LI_API = "https://api.awsli.com.br/v1";
const PROVIDER = "loja_integrada";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// --- credenciais (mesmo formato salvo pela função loja-integrada) ---
const b64 = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
async function aesKey() {
  const secret = Deno.env.get("LOVABLE_API_KEY");
  if (!secret) throw new Error("encryption_key_missing");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(p: { iv: string; data: string }) {
  const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(p.iv) }, await aesKey(), b64(p.data));
  return new TextDecoder().decode(out);
}
async function credentials(admin: any): Promise<string | null> {
  const { data } = await admin.from("integrations").select("config, api_key, application_key")
    .eq("integration_name", PROVIDER).maybeSingle();
  const enc = data?.config?.encrypted_credentials;
  if (enc?.mode === "personal_token" && enc.personal_token) return `Basic ${await decrypt(enc.personal_token)}`;
  if (enc?.api_key && enc?.application_key) {
    return `chave_api ${await decrypt(enc.api_key)} aplicacao ${await decrypt(enc.application_key)}`;
  }
  if (data?.api_key && data?.application_key) return `chave_api ${data.api_key} aplicacao ${data.application_key}`;
  return null;
}

// GET com nova tentativa em limite de requisições (429) e erros temporários (5xx).
async function liGET(path: string, auth: string): Promise<{ status: number; body: any }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${LI_API}${path}`, { headers: { Authorization: auth, "Content-Type": "application/json" } });
    if (r.status === 429 || r.status >= 500) {
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      continue;
    }
    let body: any = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status, body };
  }
  return { status: 429, body: null };
}

const idFromUri = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return idFromUri((v as any).id ?? (v as any).resource_uri);
  const m = String(v).match(/(\d+)\/?$/);
  return m ? m[1] : null;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function refreshCategories(admin: any, auth: string) {
  const rows: any[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await liGET(`/categoria/?limit=100&offset=${offset}`, auth);
    const objs = r.body?.objects ?? [];
    for (const c of objs) {
      const id = idFromUri(c.id ?? c.resource_uri);
      if (!id) continue;
      rows.push({ id, nome: String(c.nome ?? "").trim() || `Categoria ${id}`, parent_id: idFromUri(c.categoria_pai), fetched_at: new Date().toISOString() });
    }
    if (objs.length < 100) break;
  }
  if (rows.length) {
    const { error } = await admin.from("li_categories").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  return { categories: rows.length };
}

async function refreshPrices(admin: any, auth: string, offset: number, limit: number) {
  const { count } = await admin.from("product_external_links").select("product_id", { count: "exact", head: true })
    .eq("provider", PROVIDER).eq("sync_status", "linked").not("external_product_id", "like", "__unresolved__%");
  const { data: links, error } = await admin.from("product_external_links")
    .select("product_id, external_product_id")
    .eq("provider", PROVIDER).eq("sync_status", "linked").not("external_product_id", "like", "__unresolved__%")
    .order("product_id").range(offset, offset + limit - 1);
  if (error) throw error;

  let errors = 0;
  const rows = await mapLimit(links ?? [], 4, async (l: any) => {
    const r = await liGET(`/produto/${encodeURIComponent(l.external_product_id)}/`, auth);
    const now = new Date().toISOString();
    if (r.status !== 200 || !r.body) {
      errors++;
      // Sem preço quando a loja não devolve o produto (ex.: removido = http_404); a tela mostra o motivo.
      return {
        product_id: l.product_id, external_product_id: l.external_product_id, external_name: null, external_sku: null,
        preco_cheio: null, preco_promocional: null, sob_consulta: false, ativo: null,
        category_ids: [], fetched_at: now, error: `http_${r.status}`,
      };
    }
    const p = r.body;
    return {
      product_id: l.product_id,
      external_product_id: l.external_product_id,
      external_name: p.nome ?? null,
      external_sku: p.sku != null ? String(p.sku).trim() : null,
      preco_cheio: num(p.preco_cheio),
      preco_promocional: num(p.preco_promocional),
      sob_consulta: !!p.preco_sob_consulta,
      ativo: typeof p.ativo === "boolean" ? p.ativo : null,
      category_ids: (Array.isArray(p.categorias) ? p.categorias : []).map(idFromUri).filter(Boolean),
      fetched_at: now,
      error: null,
    };
  });
  if (rows.length) {
    const { error: upErr } = await admin.from("li_price_snapshot").upsert(rows, { onConflict: "product_id" });
    if (upErr) throw upErr;
  }
  const processed = offset + (links?.length ?? 0);
  return { processed, total: count ?? processed, errors, done: (links?.length ?? 0) < limit };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const caller = await identifyCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);
    if (caller.kind === "user") {
      // Mesma regra do banco para alterar produtos.
      const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: allowed } = await userClient.rpc("can_edit_products");
      if (allowed !== true) return json({ error: "Sem permissão para atualizar preços" }, 403);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const auth = await credentials(admin);
    if (!auth) return json({ error: "Integração com a Loja Integrada não configurada" }, 400);

    const body = await req.json().catch(() => ({}));
    if (body.action === "refresh_categories") return json({ ok: true, ...(await refreshCategories(admin, auth)) });
    if (body.action === "refresh_prices") {
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(60, Math.max(1, Number(body.limit) || 40));
      return json({ ok: true, ...(await refreshPrices(admin, auth, offset, limit)) });
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (err: any) {
    console.error("[loja-integrada-precos]", err);
    return json({ error: err?.message ?? "erro" }, 500);
  }
});
