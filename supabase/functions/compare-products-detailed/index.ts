import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-3-flash-preview';

function isPrivateHost(h: string) {
  h = h.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h === '0.0.0.0') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  return !!(m && +m[1] >= 16 && +m[1] <= 31);
}

async function scrapeUrl(url: string) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCI-CRM/1.0)', Accept: 'text/html' },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = (await r.text()).slice(0, 500000);
    const meta = (p: string) => {
      const rx = new RegExp(`<meta[^>]*(?:property|name)=["']${p}["'][^>]*content=["']([^"']+)["']`, 'i');
      return html.match(rx)?.[1] ?? '';
    };
    const title = meta('og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim();
    const description = meta('og:description') || meta('description');
    const image = meta('og:image');
    const brand = meta('product:brand') || meta('og:brand');
    // strip HTML to get some body text with specs
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 8000);
    return { title, description, image, brand, bodyText };
  } finally {
    clearTimeout(t);
  }
}

async function callAI(system: string, user: string, apiKey: string): Promise<string> {
  const r = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    }),
  });
  if (r.status === 429) throw new Error('AI_RATE_LIMIT');
  if (r.status === 402) throw new Error('AI_CREDITS');
  if (!r.ok) throw new Error(`AI_${r.status}:${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return d?.choices?.[0]?.message?.content ?? '{}';
}

const CATEGORY_WEIGHTS: Record<string, Record<string, number>> = {
  iluminacao: {
    'categoria e aplicação': 20, 'tipo de luz': 15, 'potência': 15,
    'temperatura de cor': 15, 'qualidade de cor': 10, 'montagem': 10,
    'controle': 10, 'dimensões/peso': 5,
  },
  camera: {
    'categoria e aplicação': 20, 'tipo de sensor': 20, 'resolução': 15,
    'gravação de vídeo': 15, 'mount de lente': 10, 'estabilização': 10,
    'conectividade': 5, 'ergonomia/peso': 5,
  },
  lente: {
    'categoria e aplicação': 20, 'mount': 20, 'distância focal': 20,
    'abertura máxima': 15, 'estabilização': 10, 'construção óptica': 10, 'peso': 5,
  },
  audio: {
    'categoria e aplicação': 20, 'tipo': 20, 'padrão polar': 15,
    'conectividade': 15, 'alcance/sem fio': 15, 'alimentação': 10, 'acessórios': 5,
  },
  monitor: {
    'categoria e aplicação': 20, 'tamanho': 15, 'resolução': 15, 'brilho': 15,
    'entradas de vídeo': 15, 'ferramentas de exposição': 10, 'alimentação': 10,
  },
  default: {
    'categoria e aplicação': 25, 'especificações principais': 30,
    'compatibilidade': 20, 'qualidade construtiva': 15, 'dimensões/peso': 10,
  },
};

function pickWeights(cat?: string) {
  const c = (cat ?? '').toLowerCase();
  if (/ilumin|led|light|cob/.test(c)) return { key: 'iluminacao', weights: CATEGORY_WEIGHTS.iluminacao };
  if (/camera|câmera/.test(c)) return { key: 'camera', weights: CATEGORY_WEIGHTS.camera };
  if (/lente|lens/.test(c)) return { key: 'lente', weights: CATEGORY_WEIGHTS.lente };
  if (/audio|áudio|microfone/.test(c)) return { key: 'audio', weights: CATEGORY_WEIGHTS.audio };
  if (/monitor|display/.test(c)) return { key: 'monitor', weights: CATEGORY_WEIGHTS.monitor };
  return { key: 'default', weights: CATEGORY_WEIGHTS.default };
}

const SYSTEM = `Você é o "Agente Comparador Técnico MCI", especialista em foto, vídeo, iluminação e áudio.
Tarefa: comparar tecnicamente 2 produtos (um pesquisado externamente, um do catálogo MCI) e devolver uma COMPARAÇÃO ESTRUTURADA.

Regras absolutas:
- NUNCA invente preço, estoque ou existência de produtos.
- Especificações do produto MCI devem SÓ vir do cadastro fornecido. Se não houver dado, use "Não informado no catálogo" e confidence "baixa".
- Especificações do produto pesquisado:
  * Se vieram de URL/scraping, marque source "url" e confidence "alta" quando o texto contém o valor explícito, "média" quando inferido.
  * Se vieram apenas do nome/modelo, marque source "estimativa_agente" e confidence "média" ou "baixa". Não apresente estimativa como fato.
  * Se você realmente não sabe, deixe valor "" e confidence "desconhecida".
- Normalize unidades (W, K, kg, cm, graus, lux, CRI, TLCI). Sinônimos de mount (ex.: "Bowens", "Bowens S", "Montagem Bowens") são a MESMA característica.
- Escreva em português, frases curtas e objetivas.

Formato de saída (JSON estrito):
{
  "left": { "brand": "", "model": "", "category": "", "application": "", "source": "url|estimativa_agente|texto_usuario", "image": "", "url": "" },
  "right": { "brand": "", "model": "", "category": "", "application": "", "source": "catalogo_mci" },
  "summary": "2-3 linhas de justificativa",
  "rows": [
    { "key": "tipo_equipamento", "label": "Tipo de equipamento", "left": {"value":"","source":"","confidence":""}, "right": {"value":"","source":"","confidence":""}, "verdict": "igual|proximo|mci_superior|pesquisado_superior|nao_comparavel|indisponivel" }
  ],
  "similarities": [""],
  "mciAdvantages": [""],
  "attentionPoints": [""],
  "conclusion": "",
  "tier": "equivalente_direto|alternativa_superior|alternativa_economica|boa_alternativa|relacionado|nao_recomendado",
  "compatibility": 0,
  "scoring": {
    "categoryKey": "iluminacao|camera|lente|audio|monitor|default",
    "breakdown": [ { "attribute": "", "weight": 0, "score": 0, "note": "" } ]
  },
  "confidenceOverall": "alta|média|baixa"
}

Para iluminação inclua no mínimo linhas: tipo_equipamento, tecnologia_fonte, potencia_nominal, temperatura_cor, faixa_temp_cor, cor (RGB/bicolor/daylight), CRI, TLCI, intensidade_lux, angulo_feixe, montagem_modificadores, controle_local, controle_app, DMX, alimentacao, consumo, refrigeracao, ruido, peso, dimensoes, protecao_IP, aplicacao, acessorios, garantia.
Para outras categorias, adapte às linhas técnicas relevantes (10+ linhas).
Verdicts NUNCA usam vermelho automaticamente; use "pesquisado_superior" quando o externo é objetivamente melhor.
A soma dos "weight" em scoring.breakdown deve totalizar ~100. "score" é 0-100 para aquele atributo. "compatibility" = média ponderada.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  const diagnostic: any = { steps: [], errors: [] };
  const log = (s: string, extra?: any) => diagnostic.steps.push({ step: s, at: Date.now() - started, ...(extra ?? {}) });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const mciId: string = body?.mci_product_id;
    const ext = body?.external ?? {};
    if (!mciId) return new Response(JSON.stringify({ error: 'mci_product_id obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: mci, error: mciErr } = await supabase.from('products').select('*').eq('id', mciId).maybeSingle();
    if (mciErr || !mci) return new Response(JSON.stringify({ error: 'Produto MCI não encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    log('mci_loaded');

    let scraped: any = null;
    let externalMode: 'url' | 'text' = 'text';
    const inputUrl: string | undefined = ext.url;
    if (inputUrl && /^https?:\/\//i.test(inputUrl)) {
      try {
        const u = new URL(inputUrl);
        if (['http:', 'https:'].includes(u.protocol) && !isPrivateHost(u.hostname)) {
          scraped = await scrapeUrl(u.toString());
          externalMode = 'url';
          log('scraped', { title: scraped.title });
        }
      } catch (e: any) {
        diagnostic.errors.push({ where: 'scrape', message: String(e?.message ?? e) });
      }
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI indisponível', diagnostic }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { weights, key: catKey } = pickWeights(mci.category_principal ?? ext.category);

    const userMsg = `PRODUTO PESQUISADO (fonte: ${externalMode}):
Entrada do usuário: ${ext.input ?? ''}
Marca: ${ext.brand ?? ''}
Modelo: ${ext.model ?? ''}
Categoria sugerida: ${ext.category ?? ''}
URL: ${inputUrl ?? ''}
${scraped ? `Título (scraping): ${scraped.title}
Descrição (scraping): ${scraped.description}
Marca meta: ${scraped.brand}
Texto extraído (parcial): ${scraped.bodyText}` : ''}

PRODUTO MCI (cadastro real — use SOMENTE estes dados):
id: ${mci.id}
Nome: ${mci.name}
Marca: ${mci.brand ?? ''}
Categoria: ${mci.category_principal ?? ''}
SKU: ${mci.sku ?? ''} | Código: ${mci.code ?? ''}
Preço: ${mci.price ?? ''}
Peso (kg): ${mci.peso_kg ?? ''}
Dimensões (cm) L×A×C: ${mci.largura_cm ?? ''} × ${mci.altura_cm ?? ''} × ${mci.comprimento_cm ?? ''}
Descrição: ${mci.description ?? ''}
Compatibilidade (texto): ${mci.compatibility ?? ''}

Pesos sugeridos para esta categoria (${catKey}) — use como referência do scoring.breakdown:
${Object.entries(weights).map(([k, v]) => `- ${k}: ${v}%`).join('\n')}

Gere a comparação JSON conforme o schema.`;

    let parsed: any = null;
    try {
      const raw = await callAI(SYSTEM, userMsg, apiKey);
      parsed = JSON.parse(raw);
      log('ai_ok');
    } catch (e: any) {
      diagnostic.errors.push({ where: 'ai', message: String(e?.message ?? e) });
      const status = e?.message === 'AI_RATE_LIMIT' ? 429 : e?.message === 'AI_CREDITS' ? 402 : 500;
      return new Response(JSON.stringify({ error: 'Falha na IA', detail: String(e?.message ?? e), diagnostic }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Enrich right side with catalog facts (never AI-invented)
    parsed.right = {
      ...(parsed.right ?? {}),
      brand: mci.brand ?? '',
      model: mci.name,
      category: mci.category_principal ?? '',
      sku: mci.sku ?? '',
      code: mci.code ?? '',
      price: mci.price,
      image: mci.image_url ?? '',
      source: 'catalogo_mci',
      id: mci.id,
    };
    parsed.left = {
      ...(parsed.left ?? {}),
      image: parsed.left?.image || scraped?.image || '',
      url: inputUrl ?? '',
    };
    parsed.diagnostic = diagnostic;
    parsed.response_time_ms = Date.now() - started;
    parsed.category_weights = weights;

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    diagnostic.errors.push({ where: 'top', message: String(e?.message ?? e) });
    return new Response(JSON.stringify({ error: String(e?.message ?? e), diagnostic }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
