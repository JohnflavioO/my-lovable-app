// Public list of active consultants for the Landing Revenda MCI form.
// Returns only non-sensitive fields (code + display name + order + is_none_option).
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase
    .from('reseller_consultants')
    .select('consultant_code, display_name, display_order, is_none_option, is_default_fallback')
    .eq('active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      consultants: (data ?? []).map((c) => ({
        code: c.consultant_code,
        label: c.display_name,
        order: c.display_order,
        is_none: c.is_none_option,
        is_default: c.is_default_fallback,
      })),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
