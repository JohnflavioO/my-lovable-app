// Daily cron: cria notificações para orçamentos marcados como Demonstração
// Dispara em 4 estágios: 7 dias antes, 3 dias antes, no dia do vencimento, vencido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteDemo {
  id: string;
  quote_number: string;
  client_name: string;
  salesperson_id: string | null;
  created_by: string | null;
  demonstration_start_date: string;
  demonstration_end_date: string;
}

type Stage = "7d" | "3d" | "due" | "overdue";

const stageMeta: Record<Stage, { type: string; titleFn: (q: QuoteDemo, days: number) => string; msgFn: (q: QuoteDemo, days: number) => string }> = {
  "7d": {
    type: "demonstration_7d",
    titleFn: (q) => `📦 Demonstração ${q.quote_number} — 7 dias para o fim`,
    msgFn: (q) => `A demonstração de ${q.client_name} termina em ${q.demonstration_end_date}. Faça contato para confirmar a devolução ou conversão em venda.`,
  },
  "3d": {
    type: "demonstration_3d",
    titleFn: (q) => `⚠️ Demonstração ${q.quote_number} — 3 dias para o fim`,
    msgFn: (q) => `Faltam 3 dias para o fim da demonstração de ${q.client_name}. Verifique status com o cliente.`,
  },
  "due": {
    type: "demonstration_due",
    titleFn: (q) => `⏰ Demonstração ${q.quote_number} vence hoje`,
    msgFn: (q) => `A demonstração de ${q.client_name} termina hoje. Faça follow-up imediato.`,
  },
  "overdue": {
    type: "demonstration_overdue",
    titleFn: (q, days) => `🔴 Demonstração ${q.quote_number} vencida há ${days} dia(s)`,
    msgFn: (q, days) => `A demonstração de ${q.client_name} está vencida há ${days} dia(s). Cobre a devolução ou converta em venda urgente.`,
  },
};

function stageForQuote(end: string, today: string): Stage | null {
  const e = new Date(end + "T00:00:00Z").getTime();
  const t = new Date(today + "T00:00:00Z").getTime();
  const diffDays = Math.round((e - t) / 86400000);
  if (diffDays === 7) return "7d";
  if (diffDays === 3) return "3d";
  if (diffDays === 0) return "due";
  if (diffDays < 0) return "overdue";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().slice(0, 10);

    const { data: quotes, error } = await supabase
      .from("quotes")
      .select("id, quote_number, client_name, salesperson_id, created_by, company_id, demonstration_start_date, demonstration_end_date")
      .eq("is_demonstration", true)
      .not("demonstration_end_date", "is", null);

    if (error) throw error;

    let createdCount = 0;
    let pushCount = 0;

    for (const q of (quotes ?? []) as (QuoteDemo & { company_id: string | null })[]) {
      const stage = stageForQuote(q.demonstration_end_date, today);
      if (!stage) continue;

      const ownerId = q.salesperson_id ?? q.created_by;
      if (!ownerId) continue;

      // Destinatários: vendedor + gestores/admins DA MESMA company_id (isolamento)
      const recipients = new Set<string>([ownerId]);
      let managersQuery = supabase
        .from("profiles")
        .select("user_id, company_id, user_roles!inner(role)")
        .in("user_roles.role", ["admin", "gestor"]);
      if (q.company_id) managersQuery = managersQuery.eq("company_id", q.company_id);
      const { data: managers } = await managersQuery;
      (managers ?? []).forEach((m: any) => { if (m.user_id) recipients.add(m.user_id); });

      const diffDays = Math.abs(
        Math.round(
          (new Date(q.demonstration_end_date + "T00:00:00Z").getTime() -
            new Date(today + "T00:00:00Z").getTime()) / 86400000,
        ),
      );
      const meta = stageMeta[stage];
      const title = meta.titleFn(q, diffDays);
      const message = meta.msgFn(q, diffDays);

      for (const userId of recipients) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("related_quote_id", q.id)
          .eq("type", meta.type)
          .gte("created_at", today + "T00:00:00Z")
          .maybeSingle();

        if (existing) continue;

        await supabase.from("notifications").insert({
          user_id: userId,
          title,
          message,
          type: meta.type,
          related_quote_id: q.id,
          related_url: `/quotes?id=${q.id}`,
          module: "demonstracao",
          priority: stage === "overdue" ? "alta" : stage === "due" ? "alta" : "normal",
          company_id: q.company_id ?? null,
          is_read: false,
        });
        createdCount++;

        try {
          await supabase.functions.invoke("send-push-notifications", {
            body: {
              action: "send_push",
              notification: {
                userId,
                title,
                body: message,
                data: { url: `/quotes?id=${q.id}`, quoteId: q.id, type: meta.type },
              },
            },
          });
          pushCount++;
        } catch (e) {
          console.warn("[demo-reminders] push falhou:", e);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, today, processed: (quotes ?? []).length, notifications: createdCount, push: pushCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[demo-reminders] erro:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
