import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um assistente comercial especialista em follow-up para vendas B2B de equipamentos industriais (empresa MCI).

Seu papel é gerar mensagens de follow-up personalizadas, profissionais e naturais em português do Brasil.

REGRAS:
- Escrever em português do Brasil, natural e profissional
- Mensagens curtas e diretas (máximo 3-4 frases)
- Tom cordial, nunca agressivo ou desesperado
- Nunca parecer robótico ou genérico
- Adaptar o tom conforme o contexto (leve, objetivo, urgente, reativação)
- Focar em abertura de conversa ou avanço da negociação
- Incluir o nome do cliente quando disponível
- Referenciar o orçamento/proposta quando relevante
- Nunca inventar dados que não foram fornecidos

FORMATO DE RESPOSTA (JSON estrito):
{
  "mensagem": "Texto da mensagem de follow-up",
  "tipo_followup": "retomada | acompanhamento | objecao | reativacao",
  "cta_recomendado": "Ação sugerida para o vendedor",
  "tom_utilizado": "Descrição curta do tom usado",
  "intencao": "O que a mensagem busca alcançar"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Validate JWT - only authenticated users can generate follow-ups
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const {
      cliente_nome = "Cliente",
      empresa_nome = "",
      vendedor_nome = "Vendedor",
      etapa_negociacao = "Pré-venda",
      dias_sem_interacao = 0,
      ultima_interacao = "",
      motivo_objecao = "",
      objetivo_followup = "Retomar conversa",
      valor_orcamento = 0,
      tom_desejado = "Profissional",
      numero_orcamento = "",
    } = body;

    const userPrompt = `Gere uma mensagem de follow-up comercial com base neste contexto:

CLIENTE: ${cliente_nome}${empresa_nome ? ` (empresa: ${empresa_nome})` : ""}
VENDEDOR: ${vendedor_nome}
ETAPA DA NEGOCIAÇÃO: ${etapa_negociacao}
DIAS SEM INTERAÇÃO: ${dias_sem_interacao}
${ultima_interacao ? `ÚLTIMA INTERAÇÃO: ${ultima_interacao}` : ""}
${motivo_objecao ? `OBJEÇÃO DO CLIENTE: ${motivo_objecao}` : ""}
OBJETIVO DO FOLLOW-UP: ${objetivo_followup}
${valor_orcamento > 0 ? `VALOR DO ORÇAMENTO: R$ ${Number(valor_orcamento).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
${numero_orcamento ? `NÚMERO DO ORÇAMENTO: ${numero_orcamento}` : ""}
TOM DESEJADO: ${tom_desejado}

Responda APENAS com o JSON no formato especificado, sem markdown ou texto extra.`;

    const startTime = Date.now();

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_followup",
                description: "Generate a structured follow-up message",
                parameters: {
                  type: "object",
                  properties: {
                    mensagem: { type: "string", description: "Follow-up message text" },
                    tipo_followup: {
                      type: "string",
                      enum: ["retomada", "acompanhamento", "objecao", "reativacao"],
                    },
                    cta_recomendado: { type: "string", description: "Recommended CTA" },
                    tom_utilizado: { type: "string", description: "Tone used" },
                    intencao: { type: "string", description: "Message intention" },
                  },
                  required: ["mensagem", "tipo_followup", "cta_recomendado", "tom_utilizado", "intencao"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_followup" } },
        }),
      }
    );

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text();
      console.error(`AI gateway error [${response.status}]: ${errText} (${elapsed}ms)`);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos nas configurações." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao gerar follow-up com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result;

    if (toolCall?.function?.arguments) {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      // Fallback: try parsing content as JSON
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    console.log(
      `Follow-up generated: etapa=${etapa_negociacao}, dias=${dias_sem_interacao}, tipo=${result.tipo_followup}, elapsed=${elapsed}ms`
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-followup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
