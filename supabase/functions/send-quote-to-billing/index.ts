import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CRM_ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método não permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const billingUrl = Deno.env.get("FATURAMENTO_URL") || "https://faturamentomcit.vercel.app/api/crm-pedido";
  const billingSecret = Deno.env.get("FATURAMENTO_SECRET");
  const sellerMapRaw = Deno.env.get("FATURAMENTO_VENDEDORES_JSON");

  if (!supabaseUrl || !anonKey || !serviceKey || !billingSecret) {
    return json(500, { ok: false, error: "Integração não configurada no servidor. Verifique os secrets do Supabase." });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { ok: false, error: "Sessão não autenticada." });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(401, { ok: false, error: "Sessão inválida." });

  let input: { quote_id?: string; file_name?: string; pdf_base64?: string };
  try {
    input = await req.json();
  } catch {
    return json(400, { ok: false, error: "JSON inválido." });
  }

  const quoteId = String(input.quote_id || "").trim();
  const fileName = String(input.file_name || "").trim();
  const pdfBase64 = String(input.pdf_base64 || "").replace(/^data:application\/pdf;base64,/, "").trim();
  if (!quoteId || !fileName || !pdfBase64) {
    return json(400, { ok: false, error: "Informe orçamento, nome do PDF e conteúdo do PDF." });
  }
  if (!/^[a-zA-Z0-9._ -]{1,120}\.pdf$/i.test(fileName)) {
    return json(400, { ok: false, error: "Nome do arquivo PDF inválido." });
  }
  if (pdfBase64.length > 12_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(pdfBase64)) {
    return json(413, { ok: false, error: "PDF inválido ou maior que o limite de envio." });
  }

  // Consultar com o token do usuário para respeitar RLS e validar o acesso antes de usar service role.
  const { data: quote, error: quoteError } = await userClient
    .from("quotes")
    .select("id, quote_number, client_id, client_name, salesperson, salesperson_id, created_by, status, notes, billing_sent_at, billing_order_number")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) return json(404, { ok: false, error: "Orçamento não encontrado ou sem permissão de acesso." });
  if (quote.billing_sent_at) {
    return json(409, { ok: false, already_sent: true, numero: quote.billing_order_number, error: "Este orçamento já foi enviado ao faturamento." });
  }
  if (quote.created_by !== authData.user.id && quote.salesperson_id !== authData.user.id) {
    // Gestores/admins podem ter acesso por RLS, mas só passam por esta função se forem também
    // responsáveis pelo orçamento; uma autorização administrativa explícita será adicionada
    // quando o modelo de papéis do projeto estiver confirmado.
    return json(403, { ok: false, error: "Somente o responsável pelo orçamento pode enviá-lo ao faturamento." });
  }

  const { data: items, error: itemsError } = await userClient
    .from("quote_items")
    .select("item_number, product_code, quantity, model, brand, specifications, unit_price, discount_percent, line_total, is_gift")
    .eq("quote_id", quoteId)
    .order("item_number");
  if (itemsError) return json(400, { ok: false, error: "Não foi possível carregar os itens do orçamento." });

  const { data: client, error: clientError } = await userClient
    .from("clients")
    .select("company_name, name")
    .eq("id", quote.client_id)
    .maybeSingle();
  if (clientError || !client) return json(400, { ok: false, error: "Cliente do orçamento não encontrado." });


  // O campo salesperson é a referência funcional do vendedor no orçamento (ex.: JOHN).
  // salesperson_id pode estar legado/desatualizado; nesse caso, usar o perfil do criador
  // somente para resolver o nome vinculado à referência, nunca para trocar o vendedor silenciosamente.
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const profileIds = [quote.salesperson_id, quote.created_by].filter(Boolean);
  let profileName = "";
  for (const profileId of profileIds) {
    const { data: profile } = await adminClient.from("profiles")
      .select("full_name, user_id, active")
      .eq("user_id", profileId)
      .maybeSingle();
    if (profile?.active && profile.full_name) {
      profileName = String(profile.full_name).trim();
      if (profileId === quote.salesperson_id) break;
    }
  }

  let sellerName = "";
  try {
    const sellerMap = sellerMapRaw ? JSON.parse(sellerMapRaw) as Record<string, string> : {};
    sellerName = String(
      sellerMap[String(quote.salesperson || "").trim()] ||
      sellerMap[authData.user.id] ||
      sellerMap[profileName] ||
      (String(quote.salesperson || "").trim().toUpperCase() === "JOHN" && profileName.toLowerCase() === "john flavio" ? "John Flavio" : "")
    ).trim();
  } catch {
    return json(500, { ok: false, error: "FATURAMENTO_VENDEDORES_JSON precisa ser um JSON válido." });
  }
  if (!sellerName) {
    return json(400, { ok: false, error: `Vendedor "${String(quote.salesperson || "não informado")}" (${profileName || "perfil não localizado"}) sem mapeamento oficial no faturamento.` });
  }

  const clientName = String(client.company_name || client.name || quote.client_name || "").trim();
  if (!clientName) return json(400, { ok: false, error: "O cliente precisa ter um nome cadastrado." });

  const observation = [
    `Pedido CRM #${quote.quote_number}`,
    quote.notes ? String(quote.notes).slice(0, 700) : "",
    `Itens: ${(items || []).length}`,
  ].filter(Boolean).join(" | ").slice(0, 1000);

  // Claim atômico: apenas uma execução pode iniciar o envio deste orçamento.
  const { data: claimed, error: claimError } = await adminClient.from("quotes")
    .update({ billing_send_status: "sending", billing_send_error: null })
    .eq("id", quoteId).is("billing_sent_at", null).eq("billing_send_status", "not_sent")
    .select("id").maybeSingle();

  // Diferenciar falha de banco (5xx) de bloqueio legítimo (409); nunca reportar ambos como duplicidade.
  if (claimError) {
    console.error("billing_claim_database_error", {
      quoteId,
      code: claimError.code,
      message: claimError.message,
      details: claimError.details,
      hint: claimError.hint,
    });
    return json(500, {
      ok: false,
      code: "BILLING_CLAIM_DATABASE_ERROR",
      error: "Não foi possível reservar o orçamento no banco. O faturamento não foi chamado; contate o administrador.",
    });
  }
  if (!claimed) {
    const { data: current, error: stateError } = await adminClient.from("quotes")
      .select("billing_send_status, billing_sent_at, billing_order_number")
      .eq("id", quoteId).maybeSingle();
    if (stateError) {
      console.error("billing_claim_state_read_error", { quoteId, code: stateError.code, message: stateError.message });
      return json(500, {
        ok: false,
        code: "BILLING_CLAIM_STATE_READ_ERROR",
        error: "Não foi possível verificar o estado de envio. O faturamento não foi chamado.",
      });
    }
    if (current?.billing_sent_at || current?.billing_send_status === "sent") {
      return json(409, {
        ok: false,
        code: "QUOTE_ALREADY_SENT",
        already_sent: true,
        numero: current.billing_order_number,
        error: "Este orçamento já consta como enviado. Confirme o pedido no faturamento antes de qualquer nova tentativa.",
      });
    }
    if (current?.billing_send_status === "sending") {
      return json(409, {
        ok: false,
        code: "QUOTE_SEND_IN_PROGRESS",
        error: "O orçamento está marcado como em envio. Não foi feita nova chamada ao faturamento; é necessário verificar o histórico antes de liberar a tentativa.",
      });
    }
    return json(409, {
      ok: false,
      code: "QUOTE_SEND_STATE_CONFLICT",
      error: `O orçamento não pôde ser reservado (estado: ${current?.billing_send_status || "desconhecido"}). O faturamento não foi chamado.`,
    });
  }

  const billingPayload = {
    vendedor: sellerName,
    cliente: clientName,
    arquivo_nome: fileName,
    arquivo_base64: pdfBase64.replace(/\s/g, ""),
    id_externo: String(quote.id).slice(0, 100),
    observacao: observation,
  };

  let response: Response;
  let responseBody: Record<string, unknown> = {};
  try {
    response = await fetch(billingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": billingSecret },
      body: JSON.stringify(billingPayload),
      signal: AbortSignal.timeout(25_000),
    });
    responseBody = await response.json().catch(() => ({}));
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Tempo excedido ao conectar ao faturamento. O orçamento continua desbloqueado; tente novamente."
      : "Não foi possível conectar ao faturamento. O orçamento continua desbloqueado; tente novamente.";
    await adminClient.from("quotes").update({ billing_send_status: "not_sent", billing_send_error: message }).eq("id", quoteId).is("billing_sent_at", null);
    return json(502, { ok: false, error: message });
  }

  if (response.status === 409) {
    const existingNumber = responseBody.numero ?? responseBody.number ?? null;
    await adminClient.from("quotes").update({
      billing_sent_at: new Date().toISOString(),
      billing_order_number: existingNumber == null ? null : String(existingNumber),
      billing_send_status: "sent",
      billing_send_error: null,
    }).eq("id", quoteId).is("billing_sent_at", null);
    return json(200, { ok: true, already_sent: true, numero: existingNumber });
  }

  if (!response.ok || responseBody.ok !== true) {
    const safeMessage = String(responseBody.error || responseBody.message || `Faturamento respondeu HTTP ${response.status}.`).slice(0, 500);
    await adminClient.from("quotes").update({ billing_send_status: "not_sent", billing_send_error: safeMessage }).eq("id", quoteId).is("billing_sent_at", null);
    return json(502, { ok: false, error: safeMessage });
  }

  const orderNumber = responseBody.numero ?? responseBody.number ?? null;
  const { error: updateError } = await adminClient.from("quotes").update({
    billing_sent_at: new Date().toISOString(),
    billing_order_number: orderNumber == null ? null : String(orderNumber),
    billing_send_status: "sent",
    billing_send_error: null,
  }).eq("id", quoteId).is("billing_sent_at", null);

  if (updateError) {
    // The external system may already have created the order. id_externo makes a retry idempotent.
    return json(502, { ok: false, error: "O pedido pode ter sido recebido pelo faturamento, mas o CRM não registrou a confirmação. Não reenvie; verifique o faturamento." });
  }

  return json(200, { ok: true, numero: orderNumber });
});
