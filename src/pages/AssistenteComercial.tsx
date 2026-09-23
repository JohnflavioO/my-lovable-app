import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Search, Plus, History as HistoryIcon, Settings, Star, MoreHorizontal,
  Archive, Pencil, Trash2, Loader2, Users, FileText, Clock, Target,
  TrendingUp, Compass, Download, ExternalLink, ListChecks, Lightbulb, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import PreviewActionCard from '@/components/assistant/PreviewActionCard';

type Conversation = {
  id: string;
  title: string | null;
  is_favorite: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string | null;
  tool_name: string | null;
  tool_result: any;
  created_at: string;
};

const fmtBRL = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fmtBRLFull = (v: any) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Labels for summary keys (never expose raw snake_case or JSON)
const SUMMARY_LABELS: Record<string, string> = {
  metric: 'Métrica',
  period_label: 'Período',
  approved_quotes_scanned: 'Orçamentos analisados',
  revenue_total: 'Receita total',
  average_ticket: 'Ticket médio',
  approved_count: 'Aprovados',
};
const METRIC_LABELS: Record<string, string> = { quantity: 'Quantidade', revenue: 'Receita' };

function formatSummaryValue(k: string, v: any) {
  if (v == null || v === '') return '—';
  if (k === 'metric') return METRIC_LABELS[String(v)] || String(v);
  if (k === 'revenue_total' || k === 'average_ticket') return fmtBRLFull(v);
  if (typeof v === 'object') return '—'; // never render raw JSON
  return String(v);
}

function formatValue(v: any, key: string) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && (key.includes('amount') || key.includes('total') || key.includes('revenue') || key.includes('price'))) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    try { return format(new Date(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; }
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function columnLabel(c: string) {
  const map: Record<string, string> = {
    company_name: 'Empresa', name: 'Nome', city: 'Cidade', state: 'UF',
    email: 'E-mail', phone: 'Telefone', quote_number: 'Orçamento',
    client_name: 'Cliente', total_amount: 'Valor', status: 'Status',
    created_at: 'Criado em', title: 'Tarefa', due_date: 'Vencimento',
    code: 'Código', brand: 'Marca', category_principal: 'Categoria', price: 'Preço',
  };
  return map[c] || c;
}

function groupByDate(items: Conversation[]) {
  const g: Record<string, Conversation[]> = {
    'Favoritos': [], 'Hoje': [], 'Ontem': [], 'Esta semana': [], 'Este mês': [], 'Antigos': [], 'Arquivados': [],
  };
  for (const c of items) {
    if (c.archived_at) { g['Arquivados'].push(c); continue; }
    if (c.is_favorite) { g['Favoritos'].push(c); continue; }
    const d = new Date(c.updated_at || c.created_at);
    if (isToday(d)) g['Hoje'].push(c);
    else if (isYesterday(d)) g['Ontem'].push(c);
    else if (isThisWeek(d, { weekStartsOn: 1 })) g['Esta semana'].push(c);
    else if (isThisMonth(d)) g['Este mês'].push(c);
    else g['Antigos'].push(c);
  }
  return g;
}

const QUICK_CHIPS = [
  'Clientes inativos',
  'Produtos mais vendidos',
  'Ranking dos vendedores',
  'Pipeline',
  'Receita do mês',
  'Cross Sell',
  'Follow-ups atrasados',
];

export default function AssistenteComercial() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // KPIs
  const [kpis, setKpis] = useState({
    overdueFollowups: 0,
    inactiveClients: 0,
    negotiating: 0,
    forecastRevenue: 0,
    approvedMonth: 0,
    conversion: 0,
    demoExpiring: 0,
  });
  const [insights, setInsights] = useState<
    Array<{ id: string; label: string; description: string; action?: () => void }>
  >([]);

  // Conversation + result state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<null | { title: string; description?: string; result: any }>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const greetingName = profile?.full_name?.split(' ')[0] || '';
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }, []);

  // Last assistant response (the "current result" shown on the dashboard)
  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant') || null,
    [messages],
  );
  const lastUser = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user') || null,
    [messages],
  );

  // ----- Load KPIs + build insights -----
  useEffect(() => {
    (async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const cutoff180 = new Date(Date.now() - 180 * 86400000).toISOString();
      const in7days = new Date(Date.now() + 7 * 86400000).toISOString();

      const [tasksRes, inactiveRes, negRes, apprRes, monthRes, demoRes] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }).lt('due_date', now.toISOString()).neq('status', 'done'),
        supabase.from('clients').select('id', { count: 'exact', head: true }).or(`last_purchase_date.lt.${cutoff180},last_purchase_date.is.null`),
        supabase.from('quotes').select('id, total_amount, total, client_name').in('status', ['negotiation', 'negociacao', 'sent']).limit(1000),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', startMonth),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).gte('created_at', startMonth),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('is_demonstration', true).not('demonstration_end_date', 'is', null).lte('demonstration_end_date', in7days),
      ]);

      const forecast = (negRes.data || []).reduce((s: number, q: any) => s + Number(q.total_amount || q.total || 0), 0);
      const totalMonth = monthRes.count || 0;
      const approvedMonth = apprRes.count || 0;
      const bigDeals = (negRes.data || []).filter((q: any) => Number(q.total_amount || q.total || 0) >= 50000);

      setKpis({
        overdueFollowups: tasksRes.count || 0,
        inactiveClients: inactiveRes.count || 0,
        negotiating: negRes.data?.length || 0,
        forecastRevenue: forecast,
        approvedMonth,
        conversion: totalMonth ? Math.round((approvedMonth / totalMonth) * 1000) / 10 : 0,
        demoExpiring: demoRes.count || 0,
      });

      const built: Array<{ id: string; label: string; description: string; action?: () => void }> = [];
      if (bigDeals.length > 0) {
        built.push({
          id: 'big-deals',
          label: `${bigDeals.length} oportunidade${bigDeals.length === 1 ? '' : 's'} acima de R$ 50 mil`,
          description: 'Propostas em negociação com alto ticket para priorizar contato.',
          action: () => askDirect('Propostas em negociação acima de R$ 50 mil'),
        });
      }
      if ((tasksRes.count || 0) > 0) {
        built.push({
          id: 'followups',
          label: `${tasksRes.count} follow-up${tasksRes.count === 1 ? '' : 's'} atrasado${tasksRes.count === 1 ? '' : 's'}`,
          description: 'Tarefas comerciais vencidas que precisam de retomada.',
          action: () => askDirect('Follow-ups atrasados'),
        });
      }
      if ((demoRes.count || 0) > 0) {
        built.push({
          id: 'demos',
          label: `${demoRes.count} demonstração${demoRes.count === 1 ? '' : 'ões'} vencendo em 7 dias`,
          description: 'Equipamentos em demonstração aproximando-se do prazo — hora de negociar a venda.',
          action: () => askDirect('Demonstrações vencendo esta semana'),
        });
      }
      if ((inactiveRes.data?.length || 0) > 0) {
        built.push({
          id: 'inactive',
          label: `${inactiveRes.data!.length} clientes sem compra há +180 dias`,
          description: 'Base fria pronta para reativação com campanha ou visita comercial.',
          action: () => askDirect('Clientes há mais de 180 dias sem comprar'),
        });
      }
      setInsights(built.slice(0, 4));
    })();
  }, []);

  // ----- Conversations & messages -----
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('assistant_conversations')
      .select('id, title, is_favorite, archived_at, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(200);
    setConversations((data as any) || []);
  }, [user]);

  const loadMessages = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from('assistant_messages')
      .select('id, role, content, tool_name, tool_result, created_at')
      .eq('conversation_id', convId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true });
    setMessages((data as any) || []);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  const newConsultation = () => {
    setActiveId(null);
    setMessages([]);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      const { data, error } = await supabase.functions.invoke('assistant-commercial', {
        body: {
          message: text,
          conversation_id: activeId,
          context: {
            route: location.pathname,
            module: location.pathname.split('/')[1] || 'assistente',
            role: profile?.role,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const convId = data.conversation_id as string;
      if (!activeId) setActiveId(convId);
      await Promise.all([loadMessages(convId), loadConversations()]);
    } catch (e: any) {
      toast.error('Não foi possível consultar', { description: e.message });
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const askDirect = (q: string) => {
    setInput(q);
    // fire immediately in a new consultation for a clean result panel
    setActiveId(null);
    setMessages([]);
    setTimeout(() => send(q), 0);
  };

  // ----- Conversation actions -----
  const toggleFavorite = async (c: Conversation) => {
    await supabase.from('assistant_conversations').update({ is_favorite: !c.is_favorite }).eq('id', c.id);
    loadConversations();
  };
  const archive = async (c: Conversation) => {
    await supabase.from('assistant_conversations').update({ archived_at: c.archived_at ? null : new Date().toISOString() }).eq('id', c.id);
    loadConversations();
  };
  const remove = async (c: Conversation) => {
    if (!confirm('Excluir esta consulta?')) return;
    await supabase.from('assistant_conversations').delete().eq('id', c.id);
    if (activeId === c.id) newConsultation();
    loadConversations();
  };
  const commitRename = async () => {
    if (!renaming) return;
    await supabase.from('assistant_conversations').update({ title: renameValue.slice(0, 120) }).eq('id', renaming.id);
    setRenaming(null);
    loadConversations();
  };

  // ----- Row actions -----
  const openRow = (entity: string, row: any) => {
    if (!row?.id) return;
    if (entity === 'clients') navigate(`/clients?id=${row.id}`);
    else if (entity === 'quotes') navigate(`/quotes?id=${row.id}`);
    else if (entity === 'products') navigate(`/products?id=${row.id}`);
  };
  const exportRows = (result: any) => {
    if (!result?.rows?.length) return;
    const ws = XLSX.utils.json_to_sheet(result.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, result.entity || 'dados');
    XLSX.writeFile(wb, `assistente-${result.entity || 'export'}-${format(new Date(), 'yyyyMMdd-HHmm')}.xlsx`);
  };

  // ----- KPI drill-down loaders -----
  const openKpiDrawer = async (kind: string) => {
    if (kind === 'overdue') {
      const now = new Date().toISOString();
      const { data } = await supabase.from('tasks')
        .select('id, title, due_date, status, client_id')
        .lt('due_date', now).neq('status', 'done')
        .order('due_date').limit(200);
      setDrawer({
        title: 'Follow-ups atrasados',
        description: `${data?.length || 0} tarefas vencidas.`,
        result: { entity: 'followups', columns: ['title', 'due_date', 'status'], rows: data || [], count: data?.length || 0 },
      });
    } else if (kind === 'inactive') {
      const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
      const { data } = await supabase.from('clients')
        .select('id, company_name, name, city, state, email, phone, last_purchase_date')
        .or(`last_purchase_date.lt.${cutoff},last_purchase_date.is.null`)
        .order('company_name').limit(200);
      setDrawer({
        title: 'Clientes sem compra há +180 dias',
        description: `${data?.length || 0} clientes elegíveis para reativação.`,
        result: { entity: 'clients', columns: ['company_name', 'city', 'state', 'phone', 'last_purchase_date'], rows: data || [], count: data?.length || 0 },
      });
    } else if (kind === 'negotiating') {
      const { data } = await supabase.from('quotes')
        .select('id, quote_number, client_name, total_amount, total, status, created_at')
        .in('status', ['negotiation', 'negociacao', 'sent'])
        .order('total_amount', { ascending: false }).limit(200);
      setDrawer({
        title: 'Propostas em negociação',
        description: `${data?.length || 0} propostas abertas.`,
        result: { entity: 'quotes', columns: ['quote_number', 'client_name', 'total_amount', 'status', 'created_at'], rows: data || [], count: data?.length || 0 },
      });
    } else if (kind === 'approved') {
      const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data } = await supabase.from('quotes')
        .select('id, quote_number, client_name, total_amount, total, created_at')
        .eq('status', 'approved').gte('created_at', startMonth)
        .order('created_at', { ascending: false }).limit(200);
      setDrawer({
        title: 'Orçamentos aprovados no mês',
        description: `${data?.length || 0} aprovações.`,
        result: { entity: 'quotes', columns: ['quote_number', 'client_name', 'total_amount', 'created_at'], rows: data || [], count: data?.length || 0 },
      });
    } else if (kind === 'demos') {
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString();
      const { data } = await supabase.from('quotes')
        .select('id, quote_number, client_name, demonstration_end_date, total_amount')
        .eq('is_demonstration', true).lte('demonstration_end_date', in7)
        .order('demonstration_end_date').limit(200);
      setDrawer({
        title: 'Demonstrações vencendo em 7 dias',
        description: `${data?.length || 0} equipamentos em campo.`,
        result: { entity: 'quotes', columns: ['quote_number', 'client_name', 'demonstration_end_date', 'total_amount'], rows: data || [], count: data?.length || 0 },
      });
    }
  };

  // ----- Filtered conversations for history -----
  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
  }, [conversations, search]);
  const grouped = useMemo(() => groupByDate(filteredConvs), [filteredConvs]);

  // ---------- KPI grid ----------
  const kpiCards = [
    { key: 'overdue', label: 'Follow-ups atrasados', value: kpis.overdueFollowups, icon: Clock, kind: 'overdue' },
    { key: 'demos', label: 'Demonstrações vencendo', value: kpis.demoExpiring, icon: Compass, kind: 'demos' },
    { key: 'inactive', label: 'Clientes sem compra', value: kpis.inactiveClients, icon: Users, kind: 'inactive' },
    { key: 'forecast', label: 'Receita prevista', value: fmtBRL(kpis.forecastRevenue), icon: TrendingUp, kind: 'negotiating' },
    { key: 'pipeline', label: 'Propostas em negociação', value: kpis.negotiating, icon: FileText, kind: 'negotiating' },
    { key: 'conversion', label: 'Conversão do mês', value: `${kpis.conversion}%`, icon: Target, kind: 'approved' },
  ];

  // ---------- History rail (used both in desktop column and in Sheet) ----------
  const historyRail = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/60 space-y-2">
        <Button onClick={newConsultation} className="w-full justify-start h-9" variant="outline">
          <Plus className="h-4 w-4" /> Nova consulta
        </Button>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar consultas"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {Object.entries(grouped).map(([label, items]) =>
          items.length === 0 ? null : (
            <div key={label}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                {label === 'Favoritos' && <Star className="h-3 w-3" />} {label}
              </p>
              <div className="space-y-0.5">
                {items.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'group flex items-center rounded-md text-sm',
                      activeId === c.id ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <button
                      onClick={() => { setActiveId(c.id); setHistoryOpen(false); }}
                      className="flex-1 text-left px-2 py-1.5 truncate"
                    >
                      {c.title || 'Sem título'}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 mr-1 rounded hover:bg-background"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => toggleFavorite(c)}>
                          <Star className={cn('h-4 w-4', c.is_favorite && 'fill-amber-400 text-amber-500')} />
                          {c.is_favorite ? 'Remover favorito' : 'Favoritar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setRenaming(c); setRenameValue(c.title || ''); }}>
                          <Pencil className="h-4 w-4" /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => archive(c)}>
                          <Archive className="h-4 w-4" /> {c.archived_at ? 'Desarquivar' : 'Arquivar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => remove(c)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </div>
          ),
        )}
        {filteredConvs.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 pt-4">Nenhuma consulta {search ? 'encontrada' : 'ainda'}.</p>
        )}
      </div>
    </div>
  );

  // ---------- Result renderer (executive card, never chat bubble) ----------
  const renderTopProducts = (result: any) => {
    const s = result.summary || {};
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Período</p>
            <p className="text-base font-semibold mt-1">{s.period_label || 'Todo o histórico'}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Métrica</p>
            <p className="text-base font-semibold mt-1">{METRIC_LABELS[s.metric] || 'Receita'}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Orçamentos analisados</p>
            <p className="text-base font-semibold mt-1">{s.approved_quotes_scanned ?? 0}</p>
          </CardContent></Card>
        </div>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
            <CardTitle className="text-sm font-semibold">{result.count} produtos no ranking</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportRows(result)}>
              <Download className="h-3.5 w-3.5" /> Exportar Excel
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[560px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-16">Imagem</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qtd. vendida</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Aprovados</TableHead>
                    <TableHead className="text-right">Preço médio</TableHead>
                    <TableHead className="text-right">Participação</TableHead>
                    <TableHead className="w-[140px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((r: any, i: number) => (
                    <TableRow key={r.product_id || r.product_code || i}>
                      <TableCell className="text-sm font-medium">{r.ranking_position}</TableCell>
                      <TableCell>
                        {r.image_url ? (
                          <img src={r.image_url} alt={r.product_name} className="h-10 w-10 rounded object-cover border border-border/40" loading="lazy" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted/40 border border-border/40" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium max-w-[280px]">{r.product_name}</TableCell>
                      <TableCell className="text-sm">{r.brand || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.sku || '—'}</TableCell>
                      <TableCell className="text-sm text-right">{Number(r.quantity_sold || 0).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtBRLFull(r.revenue)}</TableCell>
                      <TableCell className="text-sm text-right">{r.approved_quotes_count}</TableCell>
                      <TableCell className="text-sm text-right">{fmtBRLFull(r.average_price)}</TableCell>
                      <TableCell className="text-sm text-right">{Number(r.share_pct || 0).toFixed(1)}%</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled={!r.product_id} onClick={() => r.product_id && navigate(`/products?id=${r.product_id}`)}>
                              <ExternalLink className="h-4 w-4" /> Ver produto
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!r.product_id} onClick={() => r.product_id && navigate(`/products?id=${r.product_id}&edit=1`)}>
                              <Pencil className="h-4 w-4" /> Abrir cadastro
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/quotes?new=1${r.product_id ? `&product_id=${r.product_id}` : ''}`)}>
                              <FileText className="h-4 w-4" /> Criar orçamento
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/estoque-sc?q=${encodeURIComponent(r.sku || r.product_code || r.product_name)}`)}>
                              <Search className="h-4 w-4" /> Consultar estoque
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderResult = (result: any) => {
    if (!result) return null;
    if (result.entity === 'top_products' && result.rows?.length) return renderTopProducts(result);
    return (
      <div className="space-y-4">
        {result.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(result.summary)
              .filter(([, v]) => typeof v !== 'object' || v === null)
              .map(([k, v]) => (
                <Card key={k}>
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{SUMMARY_LABELS[k] || k.replace(/_/g, ' ')}</p>
                    <p className="text-xl font-semibold mt-1">{formatSummaryValue(k, v)}</p>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
        {result.rows && result.rows.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="text-sm font-semibold">
                {result.count} {result.entity === 'clients' ? 'clientes' : result.entity === 'quotes' ? 'orçamentos' : result.entity === 'products' ? 'produtos' : 'registros'} encontrados
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportRows(result)}>
                <Download className="h-3.5 w-3.5" /> Exportar Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {result.columns?.map((c: string) => <TableHead key={c}>{columnLabel(c)}</TableHead>)}
                      {result.rows[0]?.id && <TableHead className="w-[52px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((r: any, i: number) => (
                      <TableRow key={r.id || i}>
                        {result.columns?.map((c: string) => (
                          <TableCell key={c} className="text-sm">{formatValue(r[c], c)}</TableCell>
                        ))}
                        {r.id && (
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openRow(result.entity, r)}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
        {result.rows && result.rows.length === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhum registro encontrado para esta consulta.</CardContent></Card>
        )}
      </div>
    );
  };

  const isFallback = lastAssistant?.content?.startsWith('Assistente temporariamente indisponível');

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">Assistente Comercial</h1>
          <p className="text-muted-foreground text-sm">Consultor estratégico integrado ao CRM MCI.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="min-h-[40px]" onClick={() => setHistoryOpen(true)}>
            <HistoryIcon className="h-4 w-4" /> Histórico
          </Button>
          <Button variant="outline" className="min-h-[40px]" onClick={newConsultation}>
            <Plus className="h-4 w-4" /> Nova consulta
          </Button>
          <Button variant="ghost" size="icon" className="min-h-[40px] min-w-[40px]" onClick={() => navigate('/assistente/configuracoes')} aria-label="Configurações">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Two-column: main + narrow history rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-6">
        <div className="min-w-0 space-y-6">
          {/* Greeting */}
          {!lastAssistant && (
            <div>
              <p className="text-lg font-medium">
                {greeting}{greetingName ? `, ${greetingName}` : ''}.
              </p>
              <p className="text-sm text-muted-foreground">
                Hoje existem oportunidades importantes para sua carteira. Use os indicadores abaixo ou consulte diretamente pelo campo de pesquisa.
              </p>
            </div>
          )}

          {/* KPI panel */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiCards.map(({ key, label, value, icon: Icon, kind }) => (
              <button key={key} onClick={() => openKpiDrawer(kind)} className="text-left">
                <Card className="hover:border-primary/40 transition-colors h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</p>
                        <p className="mt-1.5 text-lg font-semibold">{value}</p>
                      </div>
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-muted-foreground" />
                  Insights Comerciais
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">{insights.length} destaques</Badge>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-3 pt-0">
                {insights.map((i) => (
                  <div key={i.id} className="rounded-md border border-border/60 p-3 flex items-start justify-between gap-3 hover:border-primary/40 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{i.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{i.description}</p>
                    </div>
                    {i.action && (
                      <Button variant="ghost" size="sm" onClick={i.action}>
                        Ver detalhes <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Smart search bar */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !sending && send()}
                    placeholder="Pergunte qualquer coisa sobre seus clientes, propostas, vendas ou métricas..."
                    className="h-11 pl-9 text-[15px]"
                    disabled={sending}
                  />
                </div>
                <Button onClick={() => send()} disabled={sending || !input.trim()} className="h-11 px-5">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Consultar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => askDirect(c)}
                    disabled={sending}
                    className="text-xs px-3 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Results area — executive dashboard, never chat */}
          {sending && (
            <Card><CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando dados do CRM…
            </CardContent></Card>
          )}

          {!sending && lastAssistant && (
            <div className="space-y-4">
              {lastUser && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="text-[10px]">Consulta</Badge>
                  <span className="text-muted-foreground">{lastUser.content}</span>
                </div>
              )}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-muted-foreground" /> Resultado
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{lastAssistant.content}</p>
                  {isFallback && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {['Consultar clientes','Consultar orçamentos','Consultar produtos','Follow-ups atrasados','Métricas do mês'].map((l) => (
                        <Button key={l} variant="outline" size="sm" onClick={() => askDirect(l)}>{l}</Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              {lastAssistant.tool_result?.preview ? (
                <PreviewActionCard
                  preview={lastAssistant.tool_result}
                  onResolved={() => activeId && loadMessages(activeId)}
                />
              ) : (
                renderResult(lastAssistant.tool_result)
              )}
            </div>
          )}
        </div>

        {/* Desktop history rail */}
        <aside className="hidden xl:flex flex-col rounded-lg border border-border/60 bg-card h-[calc(100vh-11rem)] sticky top-24">
          {historyRail}
        </aside>
      </div>

      {/* Mobile / trigger-based history */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-[300px] p-0">
          <SheetHeader className="p-4 border-b border-border/60">
            <SheetTitle>Histórico</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-4rem)]">{historyRail}</div>
        </SheetContent>
      </Sheet>

      {/* KPI drill-down drawer */}
      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {drawer && (
            <>
              <SheetHeader>
                <SheetTitle>{drawer.title}</SheetTitle>
                {drawer.description && <p className="text-sm text-muted-foreground">{drawer.description}</p>}
              </SheetHeader>
              <div className="mt-4">{renderResult(drawer.result)}</div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear consulta</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commitRename()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancelar</Button>
            <Button onClick={commitRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
