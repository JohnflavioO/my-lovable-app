import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SANCO_API_URL =
  "http://170.82.192.22:9999/escalasoft/armazem/producao/estoquemercadoria";
const CNPJ = "05502390000200";
const TIMEOUT_MS = 30000;

/** Always return 200 so the Supabase SDK can read the body */
function respond(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Parse the "Item" field from Sanco: "4221 - IP  F10 BARNDOOR ..."
 * Returns { codigo: "4221", descricao: "IP F10 BARNDOOR ..." }
 */
function parseItemField(raw: string): { codigo: string; descricao: string } {
  const idx = raw.indexOf(" - ");
  if (idx === -1) return { codigo: raw.trim(), descricao: raw.trim() };
  return {
    codigo: raw.substring(0, idx).trim(),
    descricao: raw.substring(idx + 3).trim(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ ok: false, error: "Não autorizado" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return respond({ ok: false, error: "Não autorizado" });
    }

    // --- External call ---
    const finalUrl = `${SANCO_API_URL}?cnpj=${CNPJ}`;
    console.log("[estoque-sc] GET", finalUrl, "user=", user.id);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = Date.now();

    let res: Response;
    try {
      res = await fetch(finalUrl, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      console.error("[estoque-sc] fetch failed:", fetchErr, "after", ms, "ms");
      return respond({
        ok: false,
        error: "API do armazém Sanco indisponível. Tente novamente.",
        diagnostics: { url: finalUrl, tempo_ms: ms, erro: String(fetchErr) },
      });
    }
    clearTimeout(timer);
    const ms = Date.now() - t0;

    const rawBody = await res.text();
    console.log("[estoque-sc] status=", res.status, "bytes=", rawBody.length, "ms=", ms); 

    if (!res.ok) {
      console.error("[estoque-sc] API error body:", rawBody.substring(0, 500));
      return respond({
        ok: false,
        error: `API Sanco retornou erro HTTP ${res.status}`,
        diagnostics: { url: finalUrl, status: res.status, body: rawBody.substring(0, 500), tempo_ms: ms },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      console.error("[estoque-sc] JSON inválido:", rawBody.substring(0, 300));
      return respond({
        ok: false,
        error: "Resposta da API Sanco não é JSON válido.",
        diagnostics: { url: finalUrl, body_preview: rawBody.substring(0, 300), tempo_ms: ms },
      });
    }

    // --- Normalize: extract simple list ---
    const rawItems = (parsed as Record<string, unknown>)?.EstoqueMercadoria;
    const list = Array.isArray(rawItems) ? rawItems : [];

    // Aggregate by product code (same product may appear on multiple addresses)
    const map = new Map<
      string,
      { codigo: string; descricao: string; unidade: string; quantidade: number }
    >();

    for (const item of list) {
      const { codigo, descricao } = parseItemField(String(item.Item ?? ""));
      const unidade = String(item.UnidadeMedida ?? "UN");
      const qtd = Number(item.SaldoDisponivel?.Quantidade ?? 0);

      const existing = map.get(codigo);
      if (existing) {
        existing.quantidade += qtd;
      } else {
        map.set(codigo, { codigo, descricao, unidade, quantidade: qtd });
      }
    }

    const items = Array.from(map.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

    console.log("[estoque-sc] OK raw:", list.length, "products:", items.length);

    return respond({
      ok: true,
      items,
      total: items.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[estoque-sc] unexpected:", err);
    return respond({
      ok: false,
      error: "Erro interno ao consultar estoque.",
      diagnostics: { stack: err instanceof Error ? err.stack : String(err) },
    });
  }
});
