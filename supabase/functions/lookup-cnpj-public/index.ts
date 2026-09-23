// Public CNPJ lookup for the external "Revenda MCI" landing page.
// GET /lookup-cnpj-public?cnpj=00000000000000
//  - Origin allowlist (no wildcard), GET only.
//  - Check-digit validation before hitting any provider.
//  - Persistent DB rate limit (20/min per hashed IP) + 7-day DB cache.
//  - 8s timeout, graceful degradation when the provider is unavailable.
//  - Returns only registration data. Never partners (QSA), never state registration.
//  - Read-only: never touches clients or any CRM record.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  fetchBrasilApiCnpj,
  isValidCnpj,
  normalizeBrasilApiCompany,
  onlyDigits,
  type CnpjCompany,
} from '../_shared/cnpj.ts';

const DEFAULT_ORIGINS = [
  'https://cadastro-revenda-mci.lovable.app',
  'https://cadastro-revenda.mcicrm.online',
];
const ALLOWED_ORIGINS = (() => {
  const fromEnv = (Deno.env.get('RESELLER_LANDING_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ORIGINS, ...fromEnv]));
})();

const CACHE_TTL_HOURS = 168; // 7 days

function corsFor(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ success: false, error: 'method_not_allowed' }, 405);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return json({ success: false, error: 'origin_not_allowed' }, 403);
  }

  const cnpj = onlyDigits(new URL(req.url).searchParams.get('cnpj'));
  if (!isValidCnpj(cnpj)) return json({ success: false, error: 'invalid_cnpj' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipHash = await sha256(`cnpj:${ip}`);
  const { data: blocked, error: rlErr } = await supabase.rpc('reseller_rate_limit_hit', {
    p_ip_hash: ipHash,
    p_max: 20,
    p_window_seconds: 60,
  });
  if (rlErr) console.error('rate_limit_check_failed', rlErr.message);
  if (blocked === true) return json({ success: false, error: 'rate_limited' }, 429);

  // Cache hit
  const { data: cached } = await supabase
    .from('cnpj_lookup_cache')
    .select('payload, fetched_at')
    .eq('cnpj', cnpj)
    .gt('fetched_at', new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString())
    .maybeSingle();

  if (cached?.payload) {
    return json({ success: true, cached: true, source: 'brasilapi', data: cached.payload as CnpjCompany });
  }

  const result = await fetchBrasilApiCnpj(cnpj, 8000);

  if (!result.ok) {
    if (result.notFound) return json({ success: false, error: 'cnpj_not_found' }, 404);
    console.error('[lookup-cnpj-public] provider unavailable', result.status ?? 'timeout');
    return json({
      success: false,
      fallback: true,
      error: 'provider_unavailable',
      message: 'Consulta de CNPJ temporariamente indisponível. Preencha os dados manualmente.',
    }, 503);
  }

  const data = normalizeBrasilApiCompany(cnpj, result.data);

  await supabase
    .from('cnpj_lookup_cache')
    .upsert({ cnpj, payload: data, fetched_at: new Date().toISOString() }, { onConflict: 'cnpj' });

  return json({ success: true, cached: false, source: 'brasilapi', data });
});
