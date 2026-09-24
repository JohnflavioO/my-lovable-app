import { createClient } from 'npm:@supabase/supabase-js@2.110.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';

const TABLE_ORDER = [
  'clients',
  'quotes',
  'quote_items',
  'financial_records',
  'logistics_records',
  'followup_notification_logs',
  'notifications',
  'import_logs',
  'quote_payment_audit',
  'user_approvals',
  'user_permissions',
] as const;
const Body = z.object({
  target_email: z.string().email(),
  source_email: z.string().email(),
  source_user_id: z.string().uuid(),
  company_id: z.string().uuid(),
  profile: z.record(z.unknown()),
  tables: z.record(z.array(z.record(z.unknown()))),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function remap(row: Record<string, unknown>, sourceUserId: string, targetUserId: string, sourceCompanyId: string, targetCompanyId: string, adminId: string) {
  const next = { ...row };
  for (const key of ['user_id', 'created_by', 'salesperson_id', 'assigned_user_id', 'target_user_id']) {
    if (next[key] === sourceUserId) next[key] = targetUserId;
  }
  if (next.company_id === sourceCompanyId) next.company_id = targetCompanyId;
  if ('approved_by' in next) next.approved_by = adminId;
  if ('performed_by' in next) next.performed_by = adminId;
  if ('granted_by' in next) next.granted_by = adminId;
  return next;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);
  const url = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXTERNAL_SUPABASE_URL');
  const publishable = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const service = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publishable || !service) return json({ error: 'Credenciais administrativas indisponíveis' }, 503);
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sessão inválida' }, 401);
  const { data: isAdmin } = await userClient.rpc('is_admin');
  if (!isAdmin) return json({ error: 'Apenas administradores podem restaurar backups' }, 403);
  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: 'Arquivo inválido' }, 400); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: 'Conteúdo do backup inválido' }, 400);
  const body = parsed.data;
  const targetEmail = body.target_email.trim().toLowerCase();
  const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    let targetUser: { id: string; email?: string } | undefined;
    for (let page = 1; page <= 20 && !targetUser; page++) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      targetUser = data.users.find((user) => user.email?.toLowerCase() === targetEmail);
      if (data.users.length < 1000) break;
    }
    if (!targetUser) return json({ error: `A conta ${targetEmail} precisa existir antes da restauração` }, 409);
    const { data: currentProfile, error: profileReadError } = await svc.from('profiles').select('id,company_id').eq('user_id', targetUser.id).maybeSingle();
    if (profileReadError) throw profileReadError;
    if (!currentProfile?.company_id) return json({ error: 'A conta de destino precisa ter uma empresa definida' }, 409);
    const targetCompanyId = String(currentProfile.company_id);
    const counts: Record<string, number> = {};
    for (const table of TABLE_ORDER) {
      const sourceRows = body.tables[table] ?? [];
      if (!sourceRows.length) { counts[table] = 0; continue; }
      const rows = sourceRows.map((row) => remap(row, body.source_user_id, targetUser.id, body.company_id, targetCompanyId, userData.user.id));
      for (let start = 0; start < rows.length; start += 100) {
        const options = table === 'user_permissions' ? { onConflict: 'user_id,permission' } : table === 'user_approvals' ? { onConflict: 'user_id' } : undefined;
        const { error } = await svc.from(table).upsert(rows.slice(start, start + 100), options);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      counts[table] = rows.length;
    }
    return json({ ok: true, email: targetEmail, source_email: body.source_email, user_id: targetUser.id, counts });
  } catch (error) {
    console.error('[backup-restore]', error instanceof Error ? error.message : 'erro');
    return json({ error: error instanceof Error ? error.message : 'Falha na restauração' }, 500);
  }
});