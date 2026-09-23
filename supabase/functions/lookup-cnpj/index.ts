const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const calc = (base: string, weights: number[]) =>
    weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0);
  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const firstMod = calc(digits, firstWeights) % 11;
  const firstDigit = firstMod < 2 ? 0 : 11 - firstMod;
  const secondMod = calc(digits, secondWeights) % 11;
  const secondDigit = secondMod < 2 ? 0 : 11 - secondMod;
  return Number(digits[12]) === firstDigit && Number(digits[13]) === secondDigit;
}

function formatPhone(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return phone || '';
}

function normalizeBrasilApi(data: Record<string, any>) {
  return {
    company_name: String(data.razao_social || data.nome_fantasia || ''),
    phone: formatPhone(data.ddd_telefone_1),
    email: String(data.email || '').toLowerCase(),
    cep: String(data.cep || '').replace(/(\d{5})(\d{3})/, '$1-$2'),
    address: String(data.logradouro || ''),
    address_number: String(data.numero || ''),
    complement: String(data.complemento || ''),
    neighborhood: String(data.bairro || ''),
    city: String(data.municipio || ''),
    state: String(data.uf || ''),
  };
}

function normalizeReceitaWs(data: Record<string, any>) {
  return {
    company_name: String(data.nome || data.fantasia || ''),
    phone: formatPhone(data.telefone || ''),
    email: String(data.email || '').toLowerCase(),
    cep: String(data.cep || '').replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'),
    address: String(data.logradouro || ''),
    address_number: String(data.numero || ''),
    complement: String(data.complemento || ''),
    neighborhood: String(data.bairro || ''),
    city: String(data.municipio || ''),
    state: String(data.uf || ''),
  };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Lovable-CNPJ-Lookup/1.0' },
    });
  } finally {
    clearTimeout(id);
  }
}

async function tryBrasilApi(cnpj: string) {
  try {
    const r = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, 8000);
    if (r.status === 404) return { notFound: true as const };
    if (!r.ok) {
      console.error('[lookup-cnpj] BrasilAPI error', r.status);
      return null;
    }
    return { data: normalizeBrasilApi(await r.json()) };
  } catch (e) {
    console.error('[lookup-cnpj] BrasilAPI exception', e);
    return null;
  }
}

async function tryReceitaWs(cnpj: string) {
  try {
    const r = await fetchWithTimeout(`https://receitaws.com.br/v1/cnpj/${cnpj}`, 8000);
    if (!r.ok) {
      console.error('[lookup-cnpj] ReceitaWS error', r.status);
      return null;
    }
    const json = await r.json();
    if (json?.status === 'ERROR') {
      if (String(json.message || '').toLowerCase().includes('não existe') || String(json.message || '').toLowerCase().includes('not found')) {
        return { notFound: true as const };
      }
      return null;
    }
    return { data: normalizeReceitaWs(json) };
  } catch (e) {
    console.error('[lookup-cnpj] ReceitaWS exception', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Método não permitido.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const cnpj = String(body?.cnpj || '').replace(/\D/g, '');
    if (!isValidCnpj(cnpj)) return jsonResponse({ success: false, error: 'CNPJ inválido.' }, 400);

    // Try BrasilAPI first
    const primary = await tryBrasilApi(cnpj);
    if (primary && 'data' in primary) return jsonResponse({ success: true, data: primary.data });
    if (primary?.notFound) {
      // Confirm with fallback before declaring not found
      const fallback = await tryReceitaWs(cnpj);
      if (fallback && 'data' in fallback) return jsonResponse({ success: true, data: fallback.data });
      return jsonResponse({ success: false, error: 'CNPJ não encontrado.' }, 404);
    }

    // Primary failed → fallback
    const fallback = await tryReceitaWs(cnpj);
    if (fallback && 'data' in fallback) return jsonResponse({ success: true, data: fallback.data });
    if (fallback?.notFound) return jsonResponse({ success: false, error: 'CNPJ não encontrado.' }, 404);

    return jsonResponse({
      success: false,
      fallback: true,
      error: 'Serviço de consulta de CNPJ temporariamente indisponível. Preencha os dados manualmente.',
    }, 200);
  } catch (error) {
    console.error('[lookup-cnpj] Unexpected error', error);
    return jsonResponse({
      success: false,
      fallback: true,
      error: 'Erro ao consultar CNPJ. Preencha os dados manualmente.',
    }, 200);
  }
});
