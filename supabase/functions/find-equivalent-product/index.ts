import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-3-flash-preview';

interface CandidateRow {
  id: string;
  name: string;
  brand: string | null;
  code: string | null;
  sku: string | null;
  category_principal: string | null;
  description: string | null;
  price: number | null;
  image_url: string | null;
  compatibility: string | null;
  score?: number;
}

interface Normalized {
  brand?: string;
  model?: string;
  category?: string;
  type?: string;
  keywords?: string[];
  application?: string;
}

// ---------- helpers ----------
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local')) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Very small synonym/expansion table for the most common categories in our catalog.
// Never invents products — only expands the search terms used against the catalog.
const SYNONYMS: Record<string, string[]> = {
  ilumina: ['LED', 'iluminador', 'light', 'luz', 'refletor', 'painel', 'panel', 'COB', 'daylight', 'bicolor', 'RGB'],
  led: ['LED', 'COB', 'iluminador', 'painel', 'luz continua'],
  cob: ['COB', 'LED', 'daylight', 'Bowens', 'iluminador'],
  bowens: ['Bowens', 'montagem Bowens', 'modificador', 'softbox'],
  daylight: ['daylight', '5600K', '5600', 'luz do dia'],
  softbox: ['softbox', 'modificador', 'Bowens'],
  camera: ['câmera', 'camera', 'cinema', 'mirrorless', 'sensor'],
  lente: ['lente', 'lens', 'objetiva', 'focal'],
  audio: ['microfone', 'lapela', 'shotgun', 'sem fio', 'wireless'],
  microfone: ['microfone', 'mic', 'lapela', 'shotgun'],
  tripe: ['tripé', 'tripod', 'suporte'],
};

function expandKeywords(base: string[], category?: string, type?: string): string[] {
  const out = new Set<string>();
  for (const k of base) {
    const clean = k.trim();
    if (clean && clean.length >= 2) out.add(clean);
  }
  const seeds = [category, type, ...base].filter(Boolean).map((s) => stripAccents(String(s).toLowerCase()));
  for (const seed of seeds) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (seed.includes(key)) syns.forEach((s) => out.add(s));
    }
  }
  return Array.from(out).slice(0, 20);
}

async function callAI(system: string, user: string, apiKey: string): Promise<string> {
  const resp = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (resp.status === 429) throw new Error('AI_RATE_LIMIT');
  if (resp.status === 402) throw new Error('AI_CREDITS');
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`AI_ERROR:${resp.status}:${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? '{}';
}

async function scrapeUrl(url: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCI-CRM/1.0)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = (await resp.text()).slice(0, 500000);
    const meta = (prop: string) => {
      const rx = new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
      return html.match(rx)?.[1] ?? '';
    };
    const title = meta('og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim();
    const description = meta('og:description') || meta('description');
    const image = meta('og:image');
    const brand = meta('product:brand') || meta('og:brand');
    return { title, description, image, brand };
  } finally {
    clearTimeout(t);
  }
}

const AGENT_SYSTEM = `Você é o "Agente Comparador de Equipamentos MCI", especialista em foto, vídeo, iluminação e áudio profissional.
Sua missão: dado um equipamento pesquisado (marca/modelo/categoria/specs) e uma lista de candidatos REAIS do catálogo MCI, escolha os MELHORES equivalentes disponíveis.

Regras obrigatórias:
- NUNCA invente produtos, IDs, preços ou estoque. Trabalhe apenas com os candidatos recebidos.
- A marca NÃO precisa ser igual à pesquisada. Priorize equivalência TÉCNICA (aplicação, potência, fonte, mount, sensor, etc.).
- Sempre retorne o máximo de 3 candidatos, ordenados por compatibilidade descendente.
- Para cada resultado, classifique em um de: "equivalente_direto", "alternativa_superior", "alternativa_economica", "relacionado".
- Escala de compatibilidade: 90-100 equivalência muito alta; 75-89 boa alternativa; 60-74 alternativa aproximada; 40-59 apenas relacionado; abaixo de 40 não retornar.
- Se nenhum candidato passar de 40, devolva um array vazio.
- Justifique com "reasons", "similarities", "differences", "pros" e "cons" (frases curtas, em português).

Responda APENAS em JSON válido no formato:
{"results":[{"id":"<uuid>","compatibility":0-100,"tier":"equivalente_direto|alternativa_superior|alternativa_economica|relacionado","reasons":[string],"similarities":[string],"differences":[string],"pros":[string],"cons":[string]}]}`;

const EXTRACT_SYSTEM = `Você identifica equipamentos profissionais de foto/vídeo/iluminação/áudio. Sempre responda APENAS em JSON:
{"brand": string, "model": string, "category": string, "type": string, "application": string, "keywords": string[]}
- "category" ex.: "Iluminação", "Câmera", "Lente", "Áudio", "Tripé", "Acessório".
- "keywords": 5 a 10 termos técnicos úteis para busca no catálogo (LED, COB, Bowens, 5600K, 60W, RGB, daylight, wireless etc.).
- Se algo for desconhecido, deixe em branco. Nunca invente.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  const diagnostic: Record<string, any> = { steps: [], errors: [] };
  const log = (step: string, data?: any) => { diagnostic.steps.push({ step, at: Date.now() - started, ...(data ?? {}) }); };

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
    const userId = claims.claims.sub;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');

    const body = await req.json().catch(() => ({}));
    const input: string = (body?.input ?? '').toString().trim();
    if (!input || input.length > 2000) {
      return new Response(JSON.stringify({ error: 'Entrada inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    diagnostic.input = input;

    let mode: 'url' | 'text' = 'text';
    let extracted: Normalized & { title?: string; description?: string; image?: string; source_url?: string } = {};
    let urlObj: URL | null = null;

    if (/^https?:\/\//i.test(input)) {
      try { urlObj = new URL(input); } catch { return new Response(JSON.stringify({ error: 'URL inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
      if (!['http:', 'https:'].includes(urlObj.protocol) || isPrivateHost(urlObj.hostname)) {
        return new Response(JSON.stringify({ error: 'URL não permitida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      mode = 'url';
    }
    diagnostic.mode = mode;

    // Cache lookup
    const hashSource = mode === 'url' ? urlObj!.toString() : input.toLowerCase();
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(hashSource));
    const inputHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: cached } = await supabase
      .from('equivalence_search_cache')
      .select('extracted_specs, candidates, expires_at')
      .eq('input_hash', inputHash)
      .maybeSingle();

    if (cached && new Date(cached.expires_at as string).getTime() > Date.now() && body?.force_refresh !== true) {
      log('cache_hit');
      const cachedResults = Array.isArray(cached.candidates) ? cached.candidates as any[] : [];
      const ids = cachedResults.map((r) => r?.product?.id).filter(Boolean) as string[];
      let freshMap = new Map<string, any>();
      if (ids.length) {
        const { data: fresh } = await supabase.from('products').select('*').in('id', ids);
        freshMap = new Map((fresh ?? []).map((p: any) => [p.id, p]));
      }
      const refreshed = cachedResults
        .map((r) => {
          const p = freshMap.get(r?.product?.id);
          if (!p) return null;
          return { ...r, product: p, _price_source: 'db_live', _fetched_at: new Date().toISOString() };
        })
        .filter(Boolean);
      return new Response(JSON.stringify({
        cached: true, extracted: cached.extracted_specs, results: refreshed,
        response_time_ms: Date.now() - started, diagnostic,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Scrape if URL
    if (mode === 'url') {
      try {
        const scraped = await scrapeUrl(urlObj!.toString());
        extracted = { ...scraped, source_url: urlObj!.toString() };
        log('scraped', { title: scraped.title });
      } catch (e: any) {
        diagnostic.errors.push({ where: 'scrape', message: String(e?.message ?? e) });
        return new Response(JSON.stringify({ error: 'Não foi possível ler a URL informada.', detail: String(e?.message ?? e), diagnostic }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Extract specs via AI (fallback to naive parse if AI down)
    let normalized: Normalized = {};
    let aiAvailable = !!apiKey;
    if (aiAvailable) {
      try {
        const extractUser = mode === 'url'
          ? `Extraia dados do produto abaixo:\nTítulo: ${extracted.title ?? ''}\nDescrição: ${extracted.description ?? ''}\nMarca (meta): ${extracted.brand ?? ''}\nURL: ${urlObj!.toString()}`
          : `Extraia dados do texto do cliente: "${input}"`;
        const raw = await callAI(EXTRACT_SYSTEM, extractUser, apiKey!);
        normalized = JSON.parse(raw);
        log('extracted', normalized);
      } catch (e: any) {
        diagnostic.errors.push({ where: 'ai_extract', message: e?.message ?? String(e) });
        if (e.message === 'AI_RATE_LIMIT' || e.message === 'AI_CREDITS') aiAvailable = false;
      }
    }
    // Naive fallback: split words
    if (!normalized.brand && !normalized.model) {
      const parts = input.split(/\s+/).filter(Boolean);
      normalized.brand = normalized.brand || parts[0];
      normalized.model = normalized.model || parts.slice(1).join(' ') || undefined;
    }
    extracted = { ...extracted, ...normalized };

    // Approved equivalences by brand+model
    if (normalized.brand && normalized.model) {
      const { data: approved } = await supabase
        .from('product_equivalences')
        .select('mci_product_id, confidence')
        .ilike('marca_externa', normalized.brand)
        .ilike('modelo_externo', normalized.model)
        .order('confidence', { ascending: false })
        .limit(3);
      if (approved && approved.length > 0) {
        log('approved_match', { count: approved.length });
        const ids = approved.map((a) => a.mci_product_id);
        const { data: prods } = await supabase.from('products').select('*').in('id', ids);
        const results = (prods ?? []).map((p) => ({
          product: p,
          compatibility: approved.find((a) => a.mci_product_id === p.id)?.confidence ?? 95,
          tier: 'equivalente_direto',
          reasons: ['Equivalência aprovada anteriormente por um vendedor'],
          similarities: [], differences: [], pros: [], cons: [], approved: true,
        }));
        return new Response(JSON.stringify({ approved_match: true, results, extracted, response_time_ms: Date.now() - started, diagnostic }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Build keyword list (expanded with synonyms)
    const baseKeywords = [normalized.model, normalized.type, ...(normalized.keywords ?? [])].filter(Boolean) as string[];
    const keywords = expandKeywords(baseKeywords, normalized.category, normalized.type);
    diagnostic.keywords = keywords;

    // Pre-filter candidates (broader search: up to 30)
    const query = [normalized.brand, normalized.model, normalized.type].filter(Boolean).join(' ') || extracted.title || input;
    const { data: candidates, error: candErr } = await supabase.rpc('search_product_candidates', {
      p_query: query,
      p_brand: null, // do NOT restrict by brand — MCI usually sells other brands
      p_category: normalized.category ?? null,
      p_limit: 30,
      p_keywords: keywords,
    });
    if (candErr) diagnostic.errors.push({ where: 'candidates', message: candErr.message });
    let candidateList = (candidates ?? []) as CandidateRow[];
    log('candidates', { count: candidateList.length });

    // If no candidates at all, retry with just keywords (no query text)
    if (candidateList.length === 0 && keywords.length > 0) {
      const { data: retry } = await supabase.rpc('search_product_candidates', {
        p_query: '',
        p_brand: null,
        p_category: normalized.category ?? null,
        p_limit: 30,
        p_keywords: keywords,
      });
      candidateList = (retry ?? []) as CandidateRow[];
      log('candidates_retry', { count: candidateList.length });
    }

    // Category fallback: broad list within same category ordered by textual similarity
    if (candidateList.length === 0 && normalized.category) {
      const { data: catList } = await supabase
        .from('products')
        .select('id,name,brand,code,sku,category_principal,description,price,image_url,compatibility')
        .ilike('category_principal', `%${normalized.category}%`)
        .limit(30);
      candidateList = (catList ?? []) as CandidateRow[];
      log('category_fallback', { count: candidateList.length });
    }

    if (candidateList.length === 0) {
      const payload = { extracted, results: [], message: 'Não encontramos produtos MCI relacionados a este equipamento no catálogo.', response_time_ms: Date.now() - started, diagnostic };
      // Do NOT cache empty results — always log history
      await supabase.from('equivalence_search_history').insert({ user_id: userId, input_type: mode, input_value: input, extracted_specs: extracted, response_time_ms: Date.now() - started });
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Rank with AI
    let ranking: { results: Array<{ id: string; compatibility: number; tier?: string; reasons?: string[]; similarities?: string[]; differences?: string[]; pros?: string[]; cons?: string[] }> } = { results: [] };
    let aiRankOk = false;
    if (aiAvailable) {
      try {
        const rankUser = JSON.stringify({
          pesquisado: {
            marca: normalized.brand,
            modelo: normalized.model,
            categoria: normalized.category,
            tipo: normalized.type,
            aplicacao: normalized.application,
            keywords,
            titulo: extracted.title,
            descricao: extracted.description,
            entrada_original: input,
          },
          candidatos: candidateList.map((c) => ({
            id: c.id,
            name: c.name,
            brand: c.brand,
            code: c.code,
            sku: c.sku,
            category: c.category_principal,
            description: (c.description ?? '').slice(0, 500),
            compatibility_notes: c.compatibility,
            price: c.price,
          })),
        });
        const raw = await callAI(AGENT_SYSTEM, rankUser, apiKey!);
        ranking = JSON.parse(raw);
        if (!Array.isArray(ranking.results)) ranking.results = [];
        aiRankOk = true;
        log('ai_rank', { count: ranking.results.length });
      } catch (e: any) {
        diagnostic.errors.push({ where: 'ai_rank', message: e?.message ?? String(e) });
        if (e.message === 'AI_RATE_LIMIT' || e.message === 'AI_CREDITS') aiAvailable = false;
      }
    }

    const byId = new Map(candidateList.map((c) => [c.id, c]));
    let results: any[] = [];

    if (aiRankOk) {
      results = ranking.results
        .filter((r) => byId.has(r.id))
        .slice(0, 3)
        .map((r) => ({
          product: byId.get(r.id),
          compatibility: Math.max(0, Math.min(100, Math.round(Number(r.compatibility) || 0))),
          tier: r.tier ?? 'relacionado',
          reasons: r.reasons ?? [],
          similarities: r.similarities ?? [],
          differences: r.differences ?? [],
          pros: r.pros ?? [],
          cons: r.cons ?? [],
          approved: false,
        }))
        .filter((r) => r.compatibility >= 40);
    }

    // Structural fallback: if AI failed OR ranked nothing, return top 3 candidates as "relacionado"
    if (results.length === 0) {
      results = candidateList.slice(0, 3).map((c) => {
        const raw = Math.round(Math.min(100, Math.max(30, (Number((c as any).score ?? 0) * 60) + 30)));
        return {
          product: c,
          compatibility: raw,
          tier: 'relacionado',
          reasons: aiAvailable
            ? ['Selecionado por proximidade técnica no catálogo MCI.']
            : ['Análise técnica avançada temporariamente indisponível — resultado estrutural do catálogo.'],
          similarities: [],
          differences: [],
          pros: [],
          cons: [],
          approved: false,
        };
      });
    }

    // Message based on best tier
    const best = results[0]?.compatibility ?? 0;
    let message: string | undefined;
    if (best < 60) message = 'Não encontramos um equivalente direto. As opções abaixo são apenas relacionadas — avalie com o cliente.';
    else if (best < 75) message = 'Não encontramos um equivalente direto, mas estas são as alternativas MCI tecnicamente mais próximas.';

    const responseTime = Date.now() - started;

    // Always refresh commercial fields from DB against the resolved product_ids.
    // Guarantees name/image/code/sku/price and same product_id are consistent.
    if (results.length > 0) {
      const ids = results.map((r: any) => r?.product?.id).filter(Boolean);
      const { data: fresh } = await supabase.from('products').select('*').in('id', ids);
      const freshMap = new Map((fresh ?? []).map((p: any) => [p.id, p]));
      results = results
        .map((r: any) => {
          const p = freshMap.get(r?.product?.id);
          if (!p) return null;
          return { ...r, product: p, _price_source: 'db_live', _fetched_at: new Date().toISOString() };
        })
        .filter(Boolean);
    }

    if (results.length > 0) {
      // Strip volatile commercial fields before caching — they must always come live from DB.
      const cacheSafe = results.map((r: any) => ({
        ...r,
        product: { ...r.product, price: null, image_url: r.product?.image_url ?? null },
      }));
      await supabase.from('equivalence_search_cache').upsert({
        input_hash: inputHash, input_type: mode, input_value: input,
        extracted_specs: extracted, candidates: cacheSafe,
      }, { onConflict: 'input_hash' });
    }

    await supabase.from('equivalence_search_history').insert({
      user_id: userId, input_type: mode, input_value: input,
      extracted_specs: extracted, response_time_ms: responseTime,
    });

    return new Response(JSON.stringify({
      extracted, results, message, response_time_ms: responseTime,
      ai_available: aiAvailable, diagnostic,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('find-equivalent-product error', e);
    diagnostic.errors.push({ where: 'top', message: String(e?.message ?? e) });
    return new Response(JSON.stringify({ error: 'Erro interno', detail: String(e?.message ?? e), diagnostic }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
