import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.mcicrm.online",
  "Access-Control-Allow-Headers": "content-type, x-crm-callback-secret, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
const str = (value: unknown) => String(value ?? "").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const secret = Deno.env.get("CRM_CALLBACK_SECRET") || "";
  if (!secret) return json(503, { ok: false, error: "Callback não configurado: CRM_CALLBACK_SECRET ausente." });
  const supplied = req.headers.get("x-crm-callback-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (supplied !== secret) return json(401, { ok: false, error: "Credencial inválida." });
  if (req.method === "GET") return json(200, { ok: true, service: "faturamento-devolucao", configured: true });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método não permitido." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
  } catch {
    return json(400, { ok: false, error: "Corpo JSON inválido." });
  }

  const event = str(body.event || body.tipo || body.type).toLowerCase();
  const isEditApproved = [
    "edicao_aprovada", "edição_aprovada", "solicitacao_edicao_aprovada",
    "solicitação_edicao_aprovada", "edit_approved", "edit_request_approved",
  ].includes(event);
  const isEditRejected = [
    "edicao_rejeitada", "edição_rejeitada", "solicitacao_edicao_rejeitada",
    "solicitação_edicao_rejeitada", "edit_rejected", "edit_request_rejected",
  ].includes(event);
  const isReturn = /devolu|return|reprov|recus/i.test(event);
  if (!isEditApproved && !isEditRejected && !isReturn) {
    return json(400, { ok: false, error: "Evento não reconhecido. Informe um evento de edição aprovada/rejeitada ou devolução.", received_event: event });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(503, { ok: false, error: "Configuração interna do Supabase incompleta." });
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const requestId = str(body.edit_request_id || body.solicitacao_edicao_id || body.request_id);
  const quoteId = str(body.quote_id || body.orcamento_id || body.id_orcamento_crm);
  const quoteNumber = str(body.quote_number || body.numero_orcamento || body.orcamento);
  const orderNumber = str(body.billing_order_id || body.pedido_id || body.id_pedido_faturamento || body.billing_order_number);
  const reason = str(body.motivo || body.reason || body.observacao || body.message || body.review_notes);

  let editRequest: Record<string, unknown> | null = null;
  if (requestId) {
    const { data, error } = await db.from("quote_edit_requests")
      .select("id, quote_id, requested_by, reason, status")
      .eq("id", requestId).maybeSingle();
    if (error) return json(500, { ok: false, error: "Falha ao consultar a solicitação de edição." });
    editRequest = data as Record<string, unknown> | null;
  }

  let quote: Record<string, unknown> | null = null;
  const resolvedQuoteId = str(editRequest?.quote_id || quoteId);
  if (resolvedQuoteId) {
    const { data, error } = await db.from("quotes")
      .select("id, quote_number, salesperson_id, created_by, billing_sent_at, billing_order_number")
      .eq("id", resolvedQuoteId).maybeSingle();
    if (error) return json(500, { ok: false, error: "Falha ao localizar o orçamento no CRM." });
    quote = data as Record<string, unknown> | null;
  } else if (quoteNumber) {
    const { data, error } = await db.from("quotes")
      .select("id, quote_number, salesperson_id, created_by, billing_sent_at, billing_order_number")
      .eq("quote_number", quoteNumber).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return json(500, { ok: false, error: "Falha ao localizar o orçamento pelo número." });
    quote = data as Record<string, unknown> | null;
  }
  if (!quote && !editRequest) return json(404, { ok: false, error: "Orçamento ou solicitação de edição não encontrados." });
  if (editRequest && !quote) return json(404, { ok: false, error: "Orçamento vinculado à solicitação não encontrado." });

  const resolvedId = str(quote?.id);
  if (!editRequest && resolvedId) {
    const { data, error } = await db.from("quote_edit_requests")
      .select("id, quote_id, requested_by, reason, status")
      .eq("quote_id", resolvedId).eq("status", "pending")
      .order("requested_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return json(500, { ok: false, error: "Falha ao localizar a solicitação pendente." });
    editRequest = data as Record<string, unknown> | null;
  }

  let recipientUserId = str(editRequest?.requested_by || quote?.salesperson_id || quote?.created_by);
  if (!recipientUserId) return json(400, { ok: false, error: "Não foi possível identificar o vendedor responsável." });

  // Only an explicit approval event releases the CRM edit lock.
  if (isEditApproved) {
    if (!editRequest) return json(409, { ok: false, error: "Não existe solicitação de edição pendente para este orçamento." });
    if (editRequest.status === "pending") {
      const { error: requestUpdateError } = await db.from("quote_edit_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString(), review_notes: reason || "Aprovada pelo faturamento." })
        .eq("id", editRequest.id).eq("status", "pending");
      if (requestUpdateError) return json(500, { ok: false, error: "Não foi possível atualizar a solicitação de edição." });
    } else if (editRequest.status !== "approved") {
      return json(409, { ok: false, error: "A solicitação não está pendente; o bloqueio não foi alterado.", current_status: editRequest.status });
    }
    const { error: unlockError } = await db.from("quotes")
      .update({ billing_sent_at: null, billing_send_status: "edit_approved", billing_send_error: null })
      .eq("id", resolvedId);
    if (unlockError) return json(500, { ok: false, error: "Solicitação aprovada, mas não foi possível liberar o orçamento para edição." });
  } else if (isEditRejected) {
    if (!editRequest) return json(404, { ok: false, error: "Solicitação de edição não encontrada." });
    const { error } = await db.from("quote_edit_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), review_notes: reason || "Rejeitada pelo faturamento." })
      .eq("id", editRequest.id).eq("status", "pending");
    if (error) return json(500, { ok: false, error: "Não foi possível registrar a rejeição da solicitação." });
  }

  const isApproved = isEditApproved;
  const title = isApproved ? "Faturamento autorizou a edição" : isEditRejected ? "Faturamento recusou a edição" : "Faturamento devolveu um pedido";
  const details = [
    quote?.quote_number ? "Orçamento: " + quote.quote_number : quoteNumber ? "Orçamento: " + quoteNumber : "",
    orderNumber ? "Pedido no faturamento: " + orderNumber : "",
    isApproved ? "A proposta foi liberada para edição no CRM." : "",
    reason ? "Observação: " + reason : "",
  ].filter(Boolean).join("\n");

  const { data: existing, error: duplicateError } = await db.from("notifications")
    .select("id").eq("user_id", recipientUserId).eq("type", "billing_callback").eq("message", details)
    .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()).limit(1);
  if (duplicateError) return json(500, { ok: false, error: "Falha ao verificar notificações duplicadas." });
  if (existing?.length) return json(200, { ok: true, duplicate: true, notification_id: existing[0].id, quote_unlocked: isApproved });

  const notification: Record<string, unknown> = {
    user_id: recipientUserId, title, message: details, type: "billing_callback",
    is_read: false, priority: "high", module: "faturamento",
    related_url: resolvedId ? "/quotes?id=" + resolvedId : "/quotes",
  };
  if (resolvedId) notification.related_quote_id = resolvedId;
  const { data: inserted, error: insertError } = await db.from("notifications").insert(notification).select("id").single();
  if (insertError) return json(500, { ok: false, error: "O retorno foi processado, mas não foi possível criar a notificação." });
  return json(201, { ok: true, notification_id: inserted.id, user_id: recipientUserId, quote_unlocked: isApproved, request_status: isEditApproved ? "approved" : isEditRejected ? "rejected" : "pending" });
});
