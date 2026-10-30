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

  let input: { quote_id?: string; technical_order_id?: string; file_name?: string; pdf_base64?: string; delivery_address?: string; already_paid?: boolean; extra_notes?: string };
  try {
    input = await req.json();
  } catch {
    return json(400, { ok: false, error: "JSON inválido." });
  }

  const isTechnicalOrder = Boolean(String(input.technical_order_id || "").trim());
  const quoteId = String(input.technical_order_id || input.quote_id || "").trim();
  const sourceTable = isTechnicalOrder ? "technical_orders" : "quotes";
  console.log("billing_stage", { stage: "input_validated", source: isTechnicalOrder ? "technical_support" : "commercial_quote", quoteId, pdfBase64Length: String(input.pdf_base64 || "").length });
  const fileName = String(input.file_name || "").trim();
  const pdfBase64 = String(input.pdf_base64 || "").replace(/^data:application\/pdf;base64,/, "").trim();
  if (!quoteId || !fileName || !pdfBase64) return json(400, { ok: false, error: "Informe orçamento, nome do PDF e conteúdo do PDF." });
  if (!/^[a-zA-Z0-9._ -]{1,120}\.pdf$/i.test(fileName)) return json(400, { ok: false, error: "Nome do arquivo PDF inválido." });
  if (pdfBase64.length > 12_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(pdfBase64)) return json(413, { ok: false, error: "PDF inválido ou maior que o limite de envio." });

  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let quote: any;
  let items: any[] = [];
  let client: any;
  if (isTechnicalOrder) {
    const { data: order, error: orderError } = await userClient.from("technical_orders")
      .select("id, os_number, client_id, client_name, technician_id, technician_name, created_by, status, technical_diagnosis, reported_defect, repair_description, total_value, billing_sent_at, billing_order_number, billing_send_status")
      .eq("id", quoteId).maybeSingle();
    if (orderError || !order) return json(404, { ok: false, error: "Ordem técnica não encontrada ou sem permissão de acesso." });
    if (order.billing_sent_at || order.billing_send_status === "sent") return json(409, { ok: false, already_sent: true, numero: order.billing_order_number, error: "Esta ordem técnica já foi enviada ao faturamento." });
    if (order.created_by !== authData.user.id && order.technician_id !== authData.user.id) return json(403, { ok: false, error: "Somente o responsável pela ordem técnica pode enviá-la ao faturamento." });
    const { data: technicalParts, error: partsError } = await userClient.from("technical_order_parts")
      .select("product_name, quantity, unit_price, total_price").eq("order_id", quoteId).order("created_at");
    if (partsError) return json(400, { ok: false, error: "Não foi possível carregar as peças da ordem técnica." });
    items = (technicalParts || []).map((part: any, index: number) => ({
      item_number: index + 1, product_code: "", quantity: part.quantity, model: part.product_name,
      brand: "Suporte Técnico", specifications: "", unit_price: part.unit_price,
      discount_percent: 0, line_total: part.total_price, is_gift: false,
    }));
    if (order.client_id) {
      const { data: technicalClient, error: technicalClientError } = await userClient.from("technical_clients")
        .select("name, cpf_cnpj, email, phone, whatsapp, address, city, state, zip_code").eq("id", order.client_id).maybeSingle();
      if (technicalClientError || !technicalClient) return json(400, { ok: false, error: "Cliente da ordem técnica não encontrado." });
      client = { company_name: technicalClient.name, name: technicalClient.name, ...technicalClient };
    } else client = { company_name: order.client_name, name: order.client_name };
    quote = {
      id: order.id, quote_number: order.os_number, client_id: order.client_id, client_name: order.client_name,
      salesperson: order.technician_name || "", salesperson_id: order.technician_id, created_by: order.created_by,
      status: order.status, notes: [order.reported_defect, order.technical_diagnosis, order.repair_description].filter(Boolean).join(" | "),
      billing_sent_at: order.billing_sent_at, billing_order_number: order.billing_order_number, billing_send_status: order.billing_send_status,
    };
  } else {
    const { data: commercialQuote, error: quoteError } = await userClient.from("quotes")
      .select("id, quote_number, client_id, client_name, salesperson, salesperson_id, created_by, status, notes, billing_sent_at, billing_order_number, billing_send_status")
      .eq("id", quoteId).maybeSingle();
    if (quoteError || !commercialQuote) return json(404, { ok: false, error: "Orçamento não encontrado ou sem permissão de acesso." });
    if (commercialQuote.billing_sent_at || commercialQuote.billing_send_status === "sent") return json(409, { ok: false, already_sent: true, numero: commercialQuote.billing_order_number, error: "Este orçamento já foi enviado ao faturamento." });
    if (commercialQuote.created_by !== authData.user.id && commercialQuote.salesperson_id !== authData.user.id) return json(403, { ok: false, error: "Somente o responsável pelo orçamento pode enviá-lo ao faturamento." });
    const { data: quoteItems, error: itemsError } = await userClient.from("quote_items")
      .select("item_number, product_code, quantity, model, brand, specifications, unit_price, discount_percent, line_total, is_gift")
      .eq("quote_id", quoteId).order("item_number");
    if (itemsError) return json(400, { ok: false, error: "Não foi possível carregar os itens do orçamento." });
    items = quoteItems || [];
    const { data: commercialClient, error: clientError } = await userClient.from("clients")
      .select("company_name, name").eq("id", commercialQuote.client_id).maybeSingle();
    if (clientError || !commercialClient) return json(400, { ok: false, error: "Cliente do orçamento não encontrado." });
    client = commercialClient;
    quote = commercialQuote;
  }

  // O campo salesperson é a referência funcional do vendedor no orçamento (ex.: JOHN).
  // salesperson_id pode estar legado/desatualizado; nesse caso, usar o perfil do criador
  // somente para resolver o nome vinculado à referência, nunca para trocar o vendedor silenciosamente.
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
    const normalizeSellerKey = (value: unknown) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const salespersonRef = String(quote.salesperson || "").trim();
    const normalizedRef = normalizeSellerKey(salespersonRef);
    const normalizedProfile = normalizeSellerKey(profileName);

    // Mapeamento oficial CRM -> nome esperado pelo sistema de faturamento.
    // As chaves são normalizadas para ignorar acentos, caixa e espaços repetidos.
    const sellerAliases: Array<{ keys: string[]; billingName: string }> = [
      { keys: ["felipe", "felipe aguiar", "felipe aguiar bezerra de meneses"], billingName: "Felipe" },
      { keys: ["paulo", "paulo fernando", "paulo fernando lima de freitas"], billingName: "Paulo" },
      { keys: ["joao paulo gomes", "joao gomes"], billingName: "João Gomes" },
      { keys: ["joao paulo de sousa barros", "joao sousa"], billingName: "João Sousa" },
      { keys: ["jonathan", "jonathan ferreira do nascimento"], billingName: "Jonathan" },
      { keys: ["vinicius", "vinicius lando", "vinicius de sousa lando"], billingName: "Vinicius" },
      { keys: ["wendel", "wendel nascimento"], billingName: "Wendel" },
      { keys: ["john", "john flavio", "jhon", "jhon flavio"], billingName: "Jhon" },
      { keys: ["luiz", "luiz gustavo", "luiz gustavo ferreira de souza"], billingName: "Luiz" },
    ];

    const alias = sellerAliases.find(({ keys }) =>
      keys.some((key) => {
        const normalizedKey = normalizeSellerKey(key);
        return normalizedRef === normalizedKey ||
          normalizedProfile === normalizedKey ||
          (normalizedKey.length >= 7 && (normalizedRef.startsWith(normalizedKey) || normalizedProfile.startsWith(normalizedKey)));
      })
    );

    // O mapeamento explícito acima prevalece para garantir o nome exato solicitado.
    // O JSON de configuração continua como fallback para outros vendedores não listados.
    const configuredAlias = Object.entries(sellerMap).find(
      ([key]) => normalizeSellerKey(key) === normalizedRef ||
        normalizeSellerKey(key) === normalizedProfile
    )?.[1];

    sellerName = String(alias?.billingName || configuredAlias || "").trim();
  } catch {
    return json(500, { ok: false, error: "FATURAMENTO_VENDEDORES_JSON precisa ser um JSON válido." });
  }
  console.log("billing_stage", { stage: "seller_resolved", quoteId, salesperson: quote.salesperson, profileName, sellerResolved: Boolean(sellerName) });
  if (!sellerName) {
    return json(400, { ok: false, error: `Vendedor "${String(quote.salesperson || "não informado")}" (${profileName || "perfil não localizado"}) sem mapeamento oficial no faturamento.` });
  }

  console.log("billing_stage", { stage: "records_loaded", quoteId, itemCount: (items || []).length, clientFound: Boolean(client) });
  const clientName = String(client.company_name || client.name || quote.client_name || "").trim();
  if (!clientName) return json(400, { ok: false, error: "O cliente precisa ter um nome cadastrado." });

  const deliveryAddress = String(input.delivery_address || "").trim().slice(0, 1000);
  const alreadyPaid = input.already_paid === true;
  const extraNotes = String(input.extra_notes || "").trim().slice(0, 1500);
  const observation = [
    `Pedido CRM #${quote.quote_number}`,
    quote.notes ? `Observações do orçamento: ${String(quote.notes).slice(0, 500)}` : "",
    deliveryAddress ? `ENDEREÇO DE ENTREGA: ${deliveryAddress}` : "",
    alreadyPaid ? "PAGAMENTO: JÁ PAGO (informado pelo vendedor)" : "",
    extraNotes ? `OBSERVAÇÕES DO VENDEDOR: ${extraNotes}` : "",
    `Itens: ${(items || []).length}`,
  ].filter(Boolean).join(" | ").slice(0, 3000);

  // Claim atômico: apenas uma execução pode iniciar o envio deste orçamento.
  const { data: claimed, error: claimError } = await adminClient.from(sourceTable)
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
    const { data: current, error: stateError } = await adminClient.from(sourceTable)
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

  console.log("billing_stage", { stage: "claim_acquired", quoteId });
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
    console.log("billing_stage", { stage: "billing_request_start", quoteId, endpointHost: new URL(billingUrl).host, payloadBytes: new TextEncoder().encode(JSON.stringify(billingPayload)).length });
    response = await fetch(billingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": billingSecret },
      body: JSON.stringify(billingPayload),
      signal: AbortSignal.timeout(25_000),
    });
    responseBody = await response.json().catch(() => ({}));
    console.log("billing_stage", { stage: "billing_response", quoteId, httpStatus: response.status, responseOk: response.ok, bodyOk: responseBody.ok === true, bodyKeys: Object.keys(responseBody), error: String(responseBody.error || responseBody.message || "").slice(0, 250) });
  } catch (error) {
    console.error("billing_stage_error", { stage: "billing_fetch_failed", quoteId, errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message.slice(0, 250) : String(error).slice(0, 250) });
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Tempo excedido ao conectar ao faturamento. O orçamento continua desbloqueado; tente novamente."
      : "Não foi possível conectar ao faturamento. O orçamento continua desbloqueado; tente novamente.";
    await adminClient.from(sourceTable).update({ billing_send_status: "not_sent", billing_send_error: message }).eq("id", quoteId).is("billing_sent_at", null);
    return json(502, { ok: false, error: message });
  }

  if (response.status === 409) {
    const existingNumber = responseBody.numero ?? responseBody.number ?? null;
    await adminClient.from(sourceTable).update({
      billing_sent_at: new Date().toISOString(),
      billing_order_number: existingNumber == null ? null : String(existingNumber),
      billing_send_status: "sent",
      billing_send_error: null,
    }).eq("id", quoteId).is("billing_sent_at", null);
    return json(200, { ok: true, already_sent: true, numero: existingNumber });
  }

  if (!response.ok || responseBody.ok !== true) {
    const safeMessage = String(responseBody.error || responseBody.message || `Faturamento respondeu HTTP ${response.status}.`).slice(0, 500);
    await adminClient.from(sourceTable).update({ billing_send_status: "not_sent", billing_send_error: safeMessage }).eq("id", quoteId).is("billing_sent_at", null);
    return json(502, { ok: false, error: safeMessage });
  }

  const orderNumber = responseBody.numero ?? responseBody.number ?? null;
  const { error: updateError } = await adminClient.from(sourceTable).update({
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
