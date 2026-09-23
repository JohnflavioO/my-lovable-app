import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { TOOL_REGISTRY, resolveTool, openAiToolSchemas, type CrmCtx } from '../_shared/crm-handlers.ts';

// ============================================================
// AI Provider config (Lovable AI Gateway — OpenAI-compatible)
// ============================================================
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const AI_MODEL = Deno.env.get('AI_MODEL') ?? 'google/gemini-3-flash-preview';
const AI_TIMEOUT_MS = Number(Deno.env.get('AI_TIMEOUT_MS') ?? 45000);
const AI_MAX_RETRIES = Number(Deno.env.get('AI_MAX_RETRIES') ?? 2);
const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================================
// Write tools (unchanged — kept for /confirm flow)
// ============================================================
type ToolCtx = CrmCtx & { service: any; context?: any; ip?: string; userAgent?: string; conversationId?: string | null };

type WriteTool = {
  action_type: string; module: string; entity_type: string;
  permission?: (profile: any) => boolean;
  schema: any;
  buildPreview: (args: any, ctx: ToolCtx) => Promise<{ summary: string; details: any; payload: any }>;
  execute: (payload: any, ctx: ToolCtx) => Promise<any>;
};

const writeTools: Record<string, WriteTool> = {
  criar_cliente: {
    action_type: 'create_client', module: 'clients', entity_type: 'client',
    schema: { type: 'function', function: { name: 'criar_cliente', description: 'Cadastrar novo cliente no CRM. Requer confirmação.', parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, company_name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, cpf_cnpj: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, notes: { type: 'string' } } } } },
    buildPreview: async (args, { userId, companyId }) => {
      const payload = { ...args, created_by: userId, company_id: companyId, pipeline_stage: 'lead', is_revenda: false, salesperson_id: userId };
      return { summary: `Cadastrar cliente "${args.company_name || args.name}"`, details: args, payload };
    },
    execute: async (payload, { supabase }) => {
      const { data, error } = await supabase.from('clients').insert(payload).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, entity_type: 'client', entity_id: data.id, message: `Cliente ${data.company_name || data.name} criado.`, row: data };
    },
  },
  editar_cliente: {
    action_type: 'edit_client', module: 'clients', entity_type: 'client',
    schema: { type: 'function', function: { name: 'editar_cliente', description: 'Editar dados de um cliente existente.', parameters: { type: 'object', required: ['client_id'], properties: { client_id: { type: 'string' }, name: { type: 'string' }, company_name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, notes: { type: 'string' } } } } },
    buildPreview: async (args, { supabase }) => {
      const { data: existing } = await supabase.from('clients').select('id, name, company_name').eq('id', args.client_id).maybeSingle();
      if (!existing) throw new Error('Cliente não encontrado');
      const { client_id, ...rest } = args;
      return { summary: `Editar cliente "${existing.company_name || existing.name}"`, details: rest, payload: { client_id, updates: rest } };
    },
    execute: async ({ client_id, updates }, { supabase }) => {
      const { data, error } = await supabase.from('clients').update(updates).eq('id', client_id).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, entity_type: 'client', entity_id: client_id, message: `Cliente ${data.company_name || data.name} atualizado.`, row: data };
    },
  },
  transferir_carteira: {
    action_type: 'transfer_client', module: 'clients', entity_type: 'client',
    permission: (p) => ['admin', 'gestor'].includes(p?.role),
    schema: { type: 'function', function: { name: 'transferir_carteira', description: 'Transferir cliente para outro vendedor (apenas admin/gestor).', parameters: { type: 'object', required: ['client_id', 'new_salesperson_id'], properties: { client_id: { type: 'string' }, new_salesperson_id: { type: 'string' } } } } },
    buildPreview: async (args, { supabase }) => {
      const { data: c } = await supabase.from('clients').select('id, name, company_name').eq('id', args.client_id).maybeSingle();
      const { data: sp } = await supabase.from('profiles').select('user_id, full_name').eq('user_id', args.new_salesperson_id).maybeSingle();
      if (!c) throw new Error('Cliente não encontrado');
      if (!sp) throw new Error('Vendedor não encontrado');
      return { summary: `Transferir "${c.company_name || c.name}" para ${sp.full_name}`, details: { cliente: c.company_name || c.name, novo_vendedor: sp.full_name }, payload: args };
    },
    execute: async (args, { supabase }) => {
      const { error } = await supabase.from('clients').update({ salesperson_id: args.new_salesperson_id }).eq('id', args.client_id);
      if (error) throw new Error(error.message);
      return { ok: true, entity_type: 'client', entity_id: args.client_id, message: 'Carteira transferida.' };
    },
  },
  aprovar_orcamento: {
    action_type: 'approve_quote', module: 'quotes', entity_type: 'quote',
    schema: { type: 'function', function: { name: 'aprovar_orcamento', description: 'Aprovar um orçamento existente.', parameters: { type: 'object', required: ['quote_id'], properties: { quote_id: { type: 'string' } } } } },
    buildPreview: async (args, { supabase }) => {
      const { data } = await supabase.from('quotes').select('id, quote_number, client_name, total_amount, status').eq('id', args.quote_id).maybeSingle();
      if (!data) throw new Error('Orçamento não encontrado');
      return { summary: `Aprovar orçamento ${data.quote_number} — ${data.client_name}`, details: data, payload: args };
    },
    execute: async (args, { supabase }) => {
      const { error } = await supabase.from('quotes').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', args.quote_id);
      if (error) throw new Error(error.message);
      return { ok: true, entity_type: 'quote', entity_id: args.quote_id, message: 'Orçamento aprovado.' };
    },
  },
  cancelar_orcamento: {
    action_type: 'cancel_quote', module: 'quotes', entity_type: 'quote',
    schema: { type: 'function', function: { name: 'cancelar_orcamento', description: 'Cancelar/rejeitar um orçamento.', parameters: { type: 'object', required: ['quote_id'], properties: { quote_id: { type: 'string' }, reason: { type: 'string' } } } } },
    buildPreview: async (args, { supabase }) => {
      const { data } = await supabase.from('quotes').select('id, quote_number, client_name, status').eq('id', args.quote_id).maybeSingle();
      if (!data) throw new Error('Orçamento não encontrado');
      return { summary: `Cancelar orçamento ${data.quote_number}`, details: { ...data, motivo: args.reason }, payload: args };
    },
    execute: async (args, { supabase }) => {
      const { error } = await supabase.from('quotes').update({ status: 'rejected', rejected_at: new Date().toISOString() }).eq('id', args.quote_id);
      if (error) throw new Error(error.message);
      return { ok: true, entity_type: 'quote', entity_id: args.quote_id, message: 'Orçamento cancelado.' };
    },
  },
  criar_tarefa: {
    action_type: 'create_task', module: 'tasks', entity_type: 'task',
    schema: { type: 'function', function: { name: 'criar_tarefa', description: 'Criar tarefa/follow-up.', parameters: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, description: { type: 'string' }, due_date: { type: 'string', description: 'YYYY-MM-DD' }, client_id: { type: 'string' } } } } },
    buildPreview: async (args, { userId }) => {
      const payload = { title: args.title, description: args.description, due_date: args.due_date, client_id: args.client_id, user_id: userId, status: 'todo' };
      return { summary: `Criar tarefa "${args.title}"${args.due_date ? ` para ${args.due_date}` : ''}`, details: payload, payload };
    },
    execute: async (payload, { supabase }) => {
      const { data, error } = await supabase.from('tasks').insert(payload).select().single();
      if (error) throw new Error(error.message);
      return { ok: true, entity_type: 'task', entity_id: data.id, message: `Tarefa criada.`, row: data };
    },
  },
};

const allToolSchemas = [
  ...openAiToolSchemas(),
  ...Object.values(writeTools).map((t) => t.schema),
];

// ============================================================
// Audit helpers
// ============================================================
async function insertAudit(service: any, row: any) {
  const { data, error } = await service.from('assistant_audit_log').insert(row).select('id').single();
  if (error) { console.error('[audit] insert error', error); return null; }
  return data.id;
}
async function updateAudit(service: any, id: string, patch: any) {
  await service.from('assistant_audit_log').update(patch).eq('id', id);
}

// ============================================================
// Fast-path classifier (routed to shared registry)
// ============================================================
const SUPERLATIVE_RE = /\b(qual|quais|quem|top|ranking|mais\s+vend|maior|menor|melhor|pior|com\s+mais|com\s+menos|com\s+maior|com\s+menor)\b/;
const GPT_KEYWORDS = ['analise','análise','analisar','resumo','resuma','estratégia','previsão','sugira','recomende','recomendação','cross sell','upsell','compare','comparar','escreva','redija','e-mail','email','proposta comercial','por que','porque','explique','interprete','crie','cadastr','edit','aprovar','cancel','mover','duplicar','transferir','agendar','atribuir'];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s%$]/g,' ').replace(/\s+/g,' ').trim();

function classify(raw: string): { mode: 'sql'; tool: string; args: any; label: string } | { mode: 'gpt' } {
  const q = norm(raw);
  // Top produtos → tool específica (bypass GPT para não errar rota)
  if (/\b(produtos?)\b.*\b(mais\s+vend|top|ranking|campe|maior\s+fatur|maior\s+quant)/.test(q)
      || /\b(top|ranking)\b.*\bprodutos?\b/.test(q)
      || /\bmais\s+vendidos?\b/.test(q)) {
    const args: any = { limit: 10, metric: /fatur|receita|valor/.test(q) ? 'revenue' : 'quantity' };
    const monthMatch = /\b(este\s+m[eê]s|do\s+m[eê]s)\b/.test(q);
    const yearMatch = /\b(este\s+ano|do\s+ano)\b/.test(q);
    if (monthMatch) args.from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    else if (yearMatch) args.from = new Date(new Date().getFullYear(), 0, 1).toISOString();
    return { mode: 'sql', tool: 'get_top_products', args, label: 'Produtos mais vendidos' };
  }
  if (SUPERLATIVE_RE.test(q)) return { mode: 'gpt' };
  for (const kw of GPT_KEYWORDS) if (q.includes(norm(kw))) return { mode: 'gpt' };
  const daysBack = (q.match(/(\d{1,3})\s+dias?/) || [])[1];
  if (/\bclientes?\b/.test(q) && /inativ|sem\s+comprar|sem\s+compra|sem\s+contat/.test(q))
    return { mode: 'sql', tool: 'get_followups', args: { days_without_contact: daysBack ? +daysBack : 180, limit: 200 }, label: 'Clientes sem interação' };
  if (/^(listar|listagem|mostrar|ver)\s+clientes?/.test(q) || q === 'clientes')
    return { mode: 'sql', tool: 'list_clients', args: { limit: 100 }, label: 'Clientes' };
  if (/^(listar|listagem|mostrar|ver)\s+(orcament|propost|quote)/.test(q)) {
    const args: any = { limit: 100 };
    if (/aprovad/.test(q)) args.status = 'approved';
    else if (/negocia/.test(q)) args.status = 'negotiation';
    return { mode: 'sql', tool: 'list_quotes', args, label: 'Orçamentos' };
  }
  if (/^(listar|listagem|mostrar|ver)\s+produtos?/.test(q)) return { mode: 'sql', tool: 'search_products', args: { limit: 50 }, label: 'Produtos' };
  if (/follow[- ]?ups?/.test(q)) return { mode: 'sql', tool: 'get_tasks', args: { overdue_only: true }, label: 'Follow-ups' };
  if (/^pipeline\b/.test(q) || q === 'funil') return { mode: 'sql', tool: 'get_pipeline', args: {}, label: 'Pipeline' };
  if (/receita|fatur|vendas?\s+do?\s+m[eê]s/.test(q)) {
    return { mode: 'sql', tool: 'get_sales_metrics', args: { from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() }, label: 'Métricas de vendas' };
  }
  return { mode: 'gpt' };
}

function humanizeSqlResult(label: string, tool: string, result: any): string {
  if (!result?.ok) return `Não foi possível consultar os dados neste momento. ${result?.error ?? ''}`.trim();
  const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (tool === 'get_top_products') {
    const n = result.count ?? 0;
    const period = result.summary?.period_label ?? 'Todo o histórico';
    if (n === 0) return `Nenhum produto vendido encontrado no período (${period}).`;
    const top = result.rows?.[0];
    const isQty = result.summary?.metric === 'quantity';
    const metricSentence = isQty
      ? `${top.quantity_sold} unidades vendidas e faturamento de ${brl(top.revenue)}`
      : `faturamento de ${brl(top.revenue)} em ${top.quantity_sold} unidades`;
    return `Período: ${period}. Foram encontrados ${n} produtos no ranking. O produto mais vendido foi ${top.product_name}, com ${metricSentence}.`;
  }
  if (tool === 'get_sales_metrics') {
    const s = result.summary;
    return `Vendas aprovadas: ${s.approved_count} orçamentos, receita ${brl(s.revenue_total)}, ticket médio ${brl(s.average_ticket)}.`;
  }
  const n = result?.count ?? 0;
  const map: Record<string, string> = { clients: 'clientes', quotes: 'orçamentos', products: 'produtos', followups: 'clientes para follow-up', pipeline: 'itens no pipeline', tasks: 'tarefas' };
  const noun = map[result?.entity] || 'registros';
  if (n === 0) return `Nenhum ${noun.replace(/s$/, '')} encontrado.`;
  return `${label}: ${n} ${noun}.`;
}

// ============================================================
// Lovable AI Gateway call with retry (429 / 5xx / timeout only)
// ============================================================
type AiError = { code: 'RATE_LIMITED' | 'CREDITS_EXHAUSTED' | 'TIMEOUT' | 'GATEWAY_ERROR' | 'BAD_REQUEST' | 'UNAUTHORIZED'; message: string; detail?: string };

async function callAiOnce(body: any, signal: AbortSignal): Promise<{ ok: true; json: any } | { ok: false; err: AiError; retriable: boolean }> {
  const r = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Lovable-API-Key': LOVABLE_API_KEY,
      'X-Lovable-AIG-SDK': 'edge-function',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (r.ok) return { ok: true, json: await r.json() };
  const text = await r.text();
  let parsed: any = null; try { parsed = JSON.parse(text); } catch {}
  const detail = parsed?.error?.message || text.slice(0, 500);
  if (r.status === 429) return { ok: false, retriable: true, err: { code: 'RATE_LIMITED', message: 'Muitas consultas simultâneas — tente novamente em instantes.', detail } };
  if (r.status === 402) return { ok: false, retriable: false, err: { code: 'CREDITS_EXHAUSTED', message: 'Créditos do assistente esgotados. Contate o administrador.', detail } };
  if (r.status === 401) return { ok: false, retriable: false, err: { code: 'UNAUTHORIZED', message: 'Falha de autenticação com o provedor de IA.', detail } };
  if (r.status >= 500) return { ok: false, retriable: true, err: { code: 'GATEWAY_ERROR', message: 'Falha temporária do provedor de IA.', detail } };
  return { ok: false, retriable: false, err: { code: 'BAD_REQUEST', message: 'Não foi possível processar a interpretação da consulta.', detail } };
}

async function callAi(body: any): Promise<{ ok: true; json: any } | { ok: false; err: AiError }> {
  let lastErr: AiError | null = null;
  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await callAiOnce(body, controller.signal);
      clearTimeout(timer);
      if (res.ok) return res;
      lastErr = res.err;
      if (!res.retriable) return { ok: false, err: res.err };
      const backoff = Math.min(2000, 300 * Math.pow(2, attempt)) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, backoff));
    } catch (e: any) {
      clearTimeout(timer);
      lastErr = { code: 'TIMEOUT', message: 'A consulta demorou demais e foi interrompida.', detail: e?.message };
      const backoff = Math.min(2000, 300 * Math.pow(2, attempt)) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return { ok: false, err: lastErr ?? { code: 'GATEWAY_ERROR', message: 'Falha desconhecida.' } };
}

async function generateTitle(userText: string): Promise<string> {
  const res = await callAi({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'Gere um título curto (máx 5 palavras, PT-BR, sem aspas ou pontuação final).' },
      { role: 'user', content: userText.slice(0, 500) },
    ],
    max_tokens: 20,
  });
  if (!res.ok) return userText.slice(0, 60);
  return (res.json.choices?.[0]?.message?.content || '').trim().replace(/^["'\.]+|["'\.]+$/g, '') || userText.slice(0, 60);
}

// ============================================================
// SERVER
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/assistant-commercial/, '');
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '';
  const userAgent = req.headers.get('user-agent') || '';
  const requestId = crypto.randomUUID();

  try {
    // ---------- /health (public, no auth) ----------
    if (path === '/health' || path.endsWith('/health')) {
      const checks: Record<string, any> = {
        ok: true,
        request_id: requestId,
        ts: new Date().toISOString(),
        ai_key_configured: !!LOVABLE_API_KEY,
        ai_model: AI_MODEL,
        ai_timeout_ms: AI_TIMEOUT_MS,
        ai_max_retries: AI_MAX_RETRIES,
        registry_tools: Object.keys(TOOL_REGISTRY),
        registry_tool_count: Object.keys(TOOL_REGISTRY).length,
        write_tools: Object.keys(writeTools),
      };
      try {
        const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { error } = await svc.from('assistant_conversations').select('id', { count: 'exact', head: true }).limit(1);
        checks.db_ok = !error;
        if (error) checks.db_error = error.message;
      } catch (e: any) {
        checks.db_ok = false; checks.db_error = e.message; checks.ok = false;
      }
      if (!LOVABLE_API_KEY) checks.ok = false;
      return new Response(JSON.stringify(checks, null, 2), { status: checks.ok ? 200 : 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing Authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } });
    const service = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const userId = userData.user.id;
    const { data: profile } = await supabase.from('profiles').select('full_name, role, company_id, permissions').eq('user_id', userId).maybeSingle();
    const companyId = profile?.company_id ?? null;

    // ---------- /debug (admin/gestor only) ----------
    if (path === '/debug' || path.endsWith('/debug')) {
      if (!['admin', 'gestor'].includes(profile?.role)) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const dbg = await req.json().catch(() => ({}));
      const { message: dbgMsg, tool: dbgTool, args: dbgArgs, execute } = dbg as { message?: string; tool?: string; args?: any; execute?: boolean };
      const out: any = { request_id: requestId, user: { id: userId, role: profile?.role, company_id: companyId } };
      if (dbgMsg) out.classification = classify(dbgMsg);
      if (dbgTool) {
        const t = resolveTool(dbgTool);
        if (!t) out.tool_error = `tool ${dbgTool} não encontrada`;
        else {
          out.resolved_tool = t.name;
          out.args = dbgArgs ?? {};
          if (execute) {
            const t0 = Date.now();
            try {
              const crmCtx: CrmCtx = { supabase, userId, profile, companyId };
              const result = await t.handler(crmCtx, dbgArgs ?? {});
              out.result = result; out.ms = Date.now() - t0;
            } catch (e: any) { out.error = e.message; out.ms = Date.now() - t0; }
          }
        }
      }
      return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---------- /confirm endpoint (write tools) ----------
    if (path === '/confirm' || path.endsWith('/confirm')) {
      const { action_id, decision } = await req.json();
      if (!action_id || !['confirm', 'cancel'].includes(decision))
        return new Response(JSON.stringify({ error: 'invalid params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: audit } = await service.from('assistant_audit_log').select('*').eq('id', action_id).maybeSingle();
      if (!audit) return new Response(JSON.stringify({ error: 'action not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (audit.user_id !== userId) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (audit.execution_status !== 'waiting_confirmation')
        return new Response(JSON.stringify({ error: 'action already resolved', status: audit.execution_status }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const ageMs = Date.now() - new Date(audit.created_at).getTime();
      if (ageMs > 10 * 60 * 1000) {
        await updateAudit(service, action_id, { execution_status: 'cancelled', confirmation_result: 'expired' });
        return new Response(JSON.stringify({ error: 'expired' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (decision === 'cancel') {
        await updateAudit(service, action_id, { execution_status: 'cancelled', confirmation_result: 'cancelled' });
        return new Response(JSON.stringify({ ok: true, cancelled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const tool = writeTools[audit.tool_name];
      if (!tool) return new Response(JSON.stringify({ error: 'unknown tool' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const started = Date.now();
      const ctx: ToolCtx = { supabase, service, userId, companyId, profile, ip, userAgent, conversationId: audit.conversation_id };
      try {
        const payload = (audit.tool_input as any)?.payload ?? audit.tool_input;
        const result = await tool.execute(payload, ctx);
        await updateAudit(service, action_id, { execution_status: 'executed', confirmation_result: 'confirmed', execution_time_ms: Date.now() - started, tool_output: result, entity_id: result.entity_id ?? null });
        if (audit.conversation_id) {
          await supabase.from('assistant_messages').insert({ conversation_id: audit.conversation_id, role: 'assistant', content: result.message || 'Ação executada.', model: 'action:executed', tool_name: audit.tool_name, tool_result: { executed: true, ...result } });
        }
        return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e: any) {
        await updateAudit(service, action_id, { execution_status: 'failed', confirmation_result: 'confirmed', execution_time_ms: Date.now() - started, tool_output: { error: e.message } });
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ---------- normal chat request ----------
    const started = Date.now();
    const body = await req.json();
    const { message, conversation_id, context } = body as { message: string; conversation_id?: string | null; context?: any };
    if (!message || typeof message !== 'string') return new Response(JSON.stringify({ error: 'message is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let convId = conversation_id || null;
    let isNew = false;
    if (!convId) {
      const { data: created, error: cErr } = await supabase.from('assistant_conversations').insert({ user_id: userId, company_id: companyId, title: message.slice(0, 60), question: message.slice(0, 500) }).select('id').single();
      if (cErr) throw cErr;
      convId = created.id; isNew = true;
    }

    const { data: prior } = await supabase.from('assistant_messages').select('role, content, tool_name, tool_args, tool_result').eq('conversation_id', convId).order('created_at', { ascending: true }).limit(40);
    await supabase.from('assistant_messages').insert({ conversation_id: convId, role: 'user', content: message });

    const crmCtx: CrmCtx = { supabase, userId, profile, companyId };

    // Fast path
    const cls = classify(message);
    if (cls.mode === 'sql') {
      const tool = resolveTool(cls.tool);
      let result: any;
      const toolStarted = Date.now();
      try {
        result = tool ? await tool.handler(crmCtx, cls.args) : { ok: false, error: `tool ${cls.tool} não implementada` };
      } catch (e: any) { result = { ok: false, error: e.message }; }
      const toolMs = Date.now() - toolStarted;
      const answer = humanizeSqlResult(cls.label, cls.tool, result);
      const elapsed = Date.now() - started;
      console.log(JSON.stringify({ evt: 'assistant.sql', requestId, userId, tool: cls.tool, args: cls.args, ok: result?.ok, count: result?.count ?? null, toolMs, elapsed }));
      await supabase.from('assistant_messages').insert({ conversation_id: convId, role: 'assistant', content: answer, model: 'sql', execution_time_ms: elapsed, tool_name: cls.tool, tool_result: result });
      await supabase.from('assistant_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
      if (isNew) await supabase.from('assistant_conversations').update({ title: cls.label.slice(0, 60) }).eq('id', convId);
      return new Response(JSON.stringify({ conversation_id: convId, answer, tool_used: cls.tool, result, mode: 'sql', request_id: requestId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // GPT path (Lovable AI Gateway)
    const contextBlock = `Contexto:
- Usuário: ${profile?.full_name ?? userId} (perfil: ${profile?.role ?? 'n/d'})
- Empresa: ${companyId ?? 'n/d'}
- Página atual: ${context?.route ?? context?.module ?? 'n/d'}`;

    const systemPrompt = `Você é o Copiloto Comercial do CRM MCI — consultor executivo de vendas.

Regras:
1. Interprete a intenção da pergunta antes de escolher tools.
2. Para "produtos mais vendidos / top produtos / ranking / campeões" SEMPRE use get_top_products (nunca get_sales_metrics).
3. Para receita/faturamento/ticket médio use get_sales_metrics.
4. Nunca invente dados. Se uma tool retornar count=0, diga que não há registros.
5. Responda em PT-BR, executivo, sem emojis: resumo direto + insight comercial + recomendação.
6. Todas as tools já respeitam a carteira do usuário (RLS). Só passe scope='team' se o usuário for admin/gestor E pedir explicitamente a equipe.
7. Para ações (criar_cliente, editar_cliente, aprovar_orcamento, etc.) devolva a PRÉVIA e encerre; não repita a mesma tool.
8. Data de hoje: ${new Date().toISOString().slice(0, 10)}.
${contextBlock}`;

    const messages: any[] = [{ role: 'system', content: systemPrompt }];
    for (const m of prior || []) if (m.role === 'user' || m.role === 'assistant') messages.push({ role: m.role, content: m.content || '' });
    messages.push({ role: 'user', content: message });

    let promptTokens = 0, completionTokens = 0, totalTokens = 0;
    let previewPayload: any = null;

    for (let step = 0; step < 4; step++) {
      const aiRes = await callAi({ model: AI_MODEL, messages, tools: allToolSchemas, tool_choice: 'auto' });
      if (!aiRes.ok) {
        console.log(JSON.stringify({ evt: 'assistant.ai_error', requestId, userId, code: aiRes.err.code, detail: aiRes.err.detail?.slice(0, 200) }));
        await supabase.from('assistant_messages').insert({ conversation_id: convId, role: 'assistant', content: aiRes.err.message, model: AI_MODEL, error: aiRes.err.detail?.slice(0, 500), execution_time_ms: Date.now() - started });
        return new Response(JSON.stringify({ conversation_id: convId, answer: aiRes.err.message, tool_used: null, result: null, error_code: aiRes.err.code, request_id: requestId }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const msg = aiRes.json.choices?.[0]?.message;
      if (aiRes.json.usage) { promptTokens += aiRes.json.usage.prompt_tokens || 0; completionTokens += aiRes.json.usage.completion_tokens || 0; totalTokens += aiRes.json.usage.total_tokens || 0; }
      if (!msg) break;
      messages.push(msg);

      if (msg.tool_calls?.length) {
        for (const call of msg.tool_calls) {
          const name = call.function.name;
          let args: any = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
          const registryTool = resolveTool(name);
          const writeTool = writeTools[name];
          const ctx: ToolCtx = { supabase, service, userId, companyId, profile, context, ip, userAgent, conversationId: convId };

          if (registryTool) {
            const t0 = Date.now();
            let result: any;
            try { result = await registryTool.handler(crmCtx, args); } catch (e: any) { result = { ok: false, error: e.message }; }
            console.log(JSON.stringify({ evt: 'assistant.tool', requestId, userId, tool: registryTool.name, args, ok: result?.ok, count: result?.count ?? null, ms: Date.now() - t0 }));
            await supabase.from('assistant_messages').insert({ conversation_id: convId, role: 'tool', tool_name: registryTool.name, tool_args: args, tool_result: result });
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
          } else if (writeTool) {
            if (writeTool.permission && !writeTool.permission(profile)) {
              messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Você não possui acesso a esta ação.' }) });
              continue;
            }
            try {
              const preview = await writeTool.buildPreview(args, ctx);
              const auditId = await insertAudit(service, {
                company_id: companyId, user_id: userId, conversation_id: convId,
                action_type: writeTool.action_type, tool_name: name, module: writeTool.module, entity_type: writeTool.entity_type,
                prompt: message, tool_input: { args, payload: preview.payload },
                confirmation_required: true, execution_status: 'waiting_confirmation',
                model: AI_MODEL, provider: 'lovable',
                ip, user_agent: userAgent,
              });
              previewPayload = { preview: true, action_id: auditId, action_type: writeTool.action_type, tool_name: name, summary: preview.summary, details: preview.details };
              messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ preview: true, summary: preview.summary, note: 'Aguardando confirmação do usuário. Não repita esta ferramenta.' }) });
            } catch (e: any) {
              messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: e.message }) });
            }
          } else {
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: `tool ${name} não implementada` }) });
          }
        }
        continue;
      }

      const answer = msg.content || (previewPayload ? previewPayload.summary : '');
      const elapsed = Date.now() - started;
      console.log(JSON.stringify({ evt: 'assistant.done', requestId, userId, elapsed, tool: previewPayload?.tool_name ?? null, tokens: totalTokens }));
      await supabase.from('assistant_messages').insert({
        conversation_id: convId, role: 'assistant', content: answer, model: AI_MODEL,
        prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens,
        execution_time_ms: elapsed,
        tool_name: previewPayload?.tool_name || null,
        tool_result: previewPayload || null,
      });
      await supabase.from('assistant_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
      if (isNew) { const title = await generateTitle(message); await supabase.from('assistant_conversations').update({ title }).eq('id', convId); }

      return new Response(JSON.stringify({ conversation_id: convId, answer, tool_used: previewPayload?.tool_name || null, result: previewPayload, preview: !!previewPayload, request_id: requestId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ conversation_id: convId, answer: 'Não foi possível concluir a análise.', result: null, request_id: requestId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[assistant-commercial]', requestId, e);
    return new Response(JSON.stringify({ error: e.message, request_id: requestId }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
