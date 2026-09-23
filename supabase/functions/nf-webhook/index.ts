import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

/**
 * NF Webhook — receives NF data from an external fiscal emitter/middleware
 * and automatically links it to the matching logistics record.
 *
 * Matching strategy (in order):
 *  1. quote_number on quotes table (e.g. "ORC-00123")
 *  2. external_order_id on quotes table
 *  3. quote_id directly
 *
 * Expected payload:
 * {
 *   "nf_numero": "000123456",
 *   "nf_chave_acesso": "35260412345678000195550010001234561234567890",
 *   "nf_data_emissao": "2026-04-14",
 *   "nf_xml_url": "https://...",
 *   "nf_pdf_url": "https://...",
 *   "referencia_pedido": "ORC-00123",   // quote_number or external_order_id
 *   "quote_id": null                     // optional direct match
 * }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // --- Auth: webhook secret ---
    const webhookSecret = Deno.env.get("NF_WEBHOOK_SECRET");
    if (webhookSecret) {
      const provided = req.headers.get("x-webhook-secret") || "";
      if (provided !== webhookSecret) {
        console.warn("[nf-webhook] Invalid webhook secret");
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Also accept Authorization header (JWT) as alternative auth
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // If no webhook secret configured, require JWT auth
    if (!webhookSecret) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Use service role for DB operations (bypass RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const PayloadSchema = z.object({
      nf_numero: z.string().min(1).max(100),
      nf_chave_acesso: z.string().max(100).optional().nullable(),
      nf_data_emissao: z.string().max(30).optional().nullable(),
      nf_xml_url: z.string().url().max(2000).optional().nullable(),
      nf_pdf_url: z.string().url().max(2000).optional().nullable(),
      referencia_pedido: z.string().max(200).optional().nullable(),
      quote_id: z.string().uuid().optional().nullable(),
    });

    const parsed = PayloadSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Payload inválido", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      nf_numero,
      nf_chave_acesso,
      nf_data_emissao,
      nf_xml_url,
      nf_pdf_url,
      referencia_pedido,
      quote_id: directQuoteId,
    } = parsed.data;

    // --- Step 1: Find the matching quote ---
    let matchedQuoteId: string | null = directQuoteId || null;

    if (!matchedQuoteId && referencia_pedido) {
      // Try quote_number first
      const { data: byNumber } = await supabase
        .from("quotes")
        .select("id")
        .eq("quote_number", referencia_pedido)
        .eq("status", "approved")
        .maybeSingle();

      if (byNumber) {
        matchedQuoteId = byNumber.id;
      } else {
        // Try external_order_id
        const { data: byExternal } = await supabase
          .from("quotes")
          .select("id")
          .eq("external_order_id", referencia_pedido)
          .eq("status", "approved")
          .maybeSingle();

        if (byExternal) {
          matchedQuoteId = byExternal.id;
        }
      }
    }

    if (!matchedQuoteId) {
      console.warn(
        `[nf-webhook] No matching quote found for ref=${referencia_pedido}, quote_id=${directQuoteId}`
      );
      return new Response(
        JSON.stringify({
          error: "Pedido não encontrado",
          detail: "Não foi possível localizar o pedido para vincular a NF.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 2: Find the logistics record ---
    const { data: logRecord, error: logErr } = await supabase
      .from("logistics_records")
      .select("id, logistics_status, nf_numero")
      .eq("quote_id", matchedQuoteId)
      .maybeSingle();

    if (logErr || !logRecord) {
      console.warn(`[nf-webhook] No logistics record for quote ${matchedQuoteId}`);
      return new Response(
        JSON.stringify({
          error: "Registro logístico não encontrado",
          detail: "O pedido existe mas não possui registro de logística.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 3: Update logistics record with NF data ---
    const updateData: Record<string, unknown> = {
      nf_numero: nf_numero,
      nf_data: nf_data_emissao || new Date().toISOString().split("T")[0],
      origem_nf: "webhook",
      ultima_sincronizacao_nf: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (nf_chave_acesso) updateData.nf_chave_acesso = nf_chave_acesso;
    if (nf_xml_url) updateData.nf_xml_url = nf_xml_url;
    if (nf_pdf_url) updateData.nf_pdf_url = nf_pdf_url;

    // Auto-advance status if still waiting
    const autoAdvanceStatuses = ["aguardando_entrada", "entrada_realizada"];
    if (autoAdvanceStatuses.includes(logRecord.logistics_status)) {
      updateData.logistics_status = "nf_emitida";
    }

    const { error: updateErr } = await supabase
      .from("logistics_records")
      .update(updateData)
      .eq("id", logRecord.id);

    if (updateErr) {
      console.error(`[nf-webhook] Update error: ${updateErr.message}`);
      return new Response(
        JSON.stringify({ error: "Erro ao atualizar registro logístico" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 4: Log the action ---
    await supabase.from("logistics_action_history").insert({
      logistics_record_id: logRecord.id,
      action_type: "nf_vinculada_automatica",
      previous_status: logRecord.logistics_status,
      new_status: (updateData.logistics_status as string) || logRecord.logistics_status,
      notes: `NF ${nf_numero} vinculada automaticamente via webhook`,
      performed_by: "00000000-0000-0000-0000-000000000000", // system
      performed_by_name: "Sistema (webhook)",
    });

    const elapsed = Date.now() - startTime;
    console.log(
      `[nf-webhook] NF ${nf_numero} linked to quote ${matchedQuoteId} (${elapsed}ms)`
    );

    return new Response(
      JSON.stringify({
        success: true,
        quote_id: matchedQuoteId,
        logistics_id: logRecord.id,
        status_atualizado: updateData.logistics_status || logRecord.logistics_status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const elapsed = Date.now() - startTime;
    console.error(`[nf-webhook] Error (${elapsed}ms):`, e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
