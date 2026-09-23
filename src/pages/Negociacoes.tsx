import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { validateQuotePaymentTerms, paymentRequiredForStatus } from '@/lib/quotePaymentValidation';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  FileText, Search, ArrowLeft, Calendar, User, Building2,
  Phone, Mail, MapPin, Store
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const db = supabase as any;

const STAGES = [
  { key: 'pre_venda', label: 'Pré-venda', color: 'bg-sky-500' },
  { key: 'contato_feito', label: 'Contato Feito', color: 'bg-blue-500' },
  { key: 'sent', label: 'Proposta Enviada', color: 'bg-amber-500' },
  { key: 'negociacao', label: 'Negociação', color: 'bg-purple-500' },
  { key: 'approved', label: 'Fechado', color: 'bg-emerald-500' },
];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface NegociacaoQuote {
  id: string;
  quote_number: string;
  client_name: string;
  client_id: string | null;
  status: string;
  total_amount: number;
  shipping_cost: number;
  created_at: string;
  created_by: string | null;
  salesperson: string | null;
  payment_terms: string | null;
  payment_method: string | null;
  payment_status: string | null;
  shipping_method: string | null;
  shipping_deadline: string | null;
  proposal_validity: string | null;
  notes: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  quote_date: string | null;
}

interface ClientInfo {
  id: string;
  company_name: string | null;
  name: string;
  cpf_cnpj: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  is_whatsapp: boolean | null;
}

interface QuoteItem {
  id: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  brand: string | null;
  code: string | null;
}

interface SellerProfile {
  user_id: string;
  full_name: string;
}

export default function Negociacoes() {
  const { user, isGestor, isAdmin } = useAuth();
  const canSeeAll = false;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<NegociacaoQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<NegociacaoQuote | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [sellerFilter, setSellerFilter] = useState('mine');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await db
      .from('quotes')
      .select('id, quote_number, client_name, client_id, status, total_amount, shipping_cost, created_at, created_by, salesperson, payment_terms, payment_method, payment_status, payment_date, installments, is_split_payment, split_method_1, split_method_2, split_value_1, split_value_2, split_date_1, split_date_2, split_installments_1, split_installments_2, shipping_method, shipping_deadline, proposal_validity, notes, approved_at, rejected_at, quote_date, clients(name, company_name, cpf_cnpj, phone, email, contact_name, contact_phone, city, state, address, is_whatsapp)')
      .eq('created_by', user?.id)
      .order('created_at', { ascending: false });

    const mapped = (data || [])
      .filter((q: any) => q.status && q.status !== 'draft')
      .map((q: any) => ({
        ...q,
        client_name: q.clients?.company_name || q.clients?.name || q.client_name || '',
      }));
    setQuotes(mapped);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadQuoteDetails = async (quote: NegociacaoQuote) => {
    setSelectedQuote(quote);

    if (quote.client_id) {
      const { data: client } = await db.from('clients').select('*').eq('id', quote.client_id).single();
      setClientInfo(client);
    } else {
      setClientInfo(null);
    }

    const { data: items } = await db.from('quote_items').select('*').eq('quote_id', quote.id).order('item_number');
    setQuoteItems(items || []);
  };

  const moveQuote = async (quoteId: string, newStatus: string) => {
    const quote = quotes.find(q => q.id === quoteId) as any;
    // Validação central de pagamento — mesma regra do formulário e do banco
    if (quote && paymentRequiredForStatus(newStatus)) {
      const check = validateQuotePaymentTerms(quote, parseFloat(String(quote.total_amount)) || 0);
      if (!check.valid) {
        toast.error(check.message!, { description: check.detail });
        try {
          await db.rpc('log_quote_payment_block', {
            _quote_id: quoteId, _action: 'negociacoes_status_change', _attempted_status: newStatus,
            _error_code: check.code || null, _missing_fields: check.fields,
          });
        } catch { /* auditoria não bloqueia */ }
        return;
      }
    }
    const { error } = await db.from('quotes').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', quoteId);
    if (error) { toast.error('Erro ao mover negociação', { description: error.message }); return; }
    setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: newStatus } : q));
    if (selectedQuote?.id === quoteId) setSelectedQuote(prev => prev ? { ...prev, status: newStatus } : null);
    toast.success('Status atualizado');
  };

  const filteredQuotes = quotes.filter(q => {
    if (statusFilter !== 'all' && q.status !== statusFilter) return false;
    if (!canSeeAll || sellerFilter === 'mine') {
      if (q.created_by !== user?.id) return false;
    } else if (sellerFilter !== 'all') {
      if (q.created_by !== sellerFilter) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return q.quote_number.toLowerCase().includes(s) || q.client_name.toLowerCase().includes(s);
    }
    return true;
  });

  const getStageIndex = (status: string) => STAGES.findIndex(s => s.key === status);

  const getSellerName = (userId: string | null) => {
    if (!userId) return '';
    if (userId === user?.id) return 'Você';
    return sellers.find(s => s.user_id === userId)?.full_name || '';
  };

  const getStatusLabel = (status: string) => STAGES.find(s => s.key === status)?.label || status;
  const getStatusColor = (status: string) => STAGES.find(s => s.key === status)?.color || 'bg-muted';

  // Detail view
  if (selectedQuote) {
    const stageIdx = getStageIndex(selectedQuote.status);
    return (
      <AppLayout>
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedQuote(null); setClientInfo(null); setQuoteItems([]); }} className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              {getSellerName(selectedQuote.created_by) && <span>{getSellerName(selectedQuote.created_by)}</span>}
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-display flex items-center gap-2">
              {selectedQuote.quote_number} — {selectedQuote.client_name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={`${getStatusColor(selectedQuote.status)} text-white`}>
                {getStatusLabel(selectedQuote.status)}
              </Badge>
              {(selectedQuote as any).is_reseller && (
                <Badge className="bg-orange-100 text-orange-800 border border-orange-200">
                  <Store className="h-3 w-3 mr-1" /> Revenda
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedQuote.status !== 'approved' && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => moveQuote(selectedQuote.id, 'approved')}>
                ✦ Marcar venda
              </Button>
            )}
            {selectedQuote.status !== 'rejected' && (
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={async () => {
                const { error } = await db.from('quotes').update({ status: 'rejected', rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selectedQuote.id);
                if (error) { toast.error('Erro'); return; }
                setSelectedQuote(prev => prev ? { ...prev, status: 'rejected' } : null);
                setQuotes(prev => prev.filter(q => q.id !== selectedQuote.id));
                toast.success('Negociação marcada como perda');
              }}>
                👎 Marcar perda
              </Button>
            )}
          </div>
        </div>

        {/* Pipeline stage bar */}
        <div className={`grid gap-0.5 mb-6 ${isMobile ? 'grid-cols-2' : `grid-cols-${STAGES.length}`}`} style={!isMobile ? { gridTemplateColumns: `repeat(${STAGES.length}, 1fr)` } : undefined}>
          {STAGES.map((stage, idx) => {
            const isActive = idx <= stageIdx;
            const isCurrent = stage.key === selectedQuote.status;
            return (
              <button
                key={stage.key}
                onClick={() => moveQuote(selectedQuote.id, stage.key)}
                className={`py-2.5 px-3 text-xs font-semibold text-center transition-all rounded-sm ${
                  isActive ? `${stage.color} text-white` : 'bg-muted text-muted-foreground'
                } ${isCurrent ? 'ring-2 ring-offset-1 ring-primary' : ''} hover:opacity-90`}
              >
                {stage.label}
              </button>
            );
          })}
        </div>

        {/* Content grid */}
        <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {/* Left: Negotiation info */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Negociação</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Nome</span><span className="font-medium">{selectedQuote.quote_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Criada em</span><span className="font-medium">{selectedQuote.created_at ? format(new Date(selectedQuote.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor total</span><span className="font-medium text-primary">{formatCurrency(parseFloat(String(selectedQuote.total_amount)) || 0)}</span></div>
                {selectedQuote.shipping_cost > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="font-medium">{formatCurrency(selectedQuote.shipping_cost)}</span></div>}
                {selectedQuote.payment_terms && <div className="flex justify-between"><span className="text-muted-foreground">Obs. Pagamento</span><span className="font-medium">{selectedQuote.payment_terms}</span></div>}
                {selectedQuote.payment_method && <div className="flex justify-between"><span className="text-muted-foreground">Forma</span><span className="font-medium">{selectedQuote.payment_method}</span></div>}
                {selectedQuote.shipping_method && <div className="flex justify-between"><span className="text-muted-foreground">Envio</span><span className="font-medium">{selectedQuote.shipping_method}</span></div>}
                {selectedQuote.shipping_deadline && <div className="flex justify-between"><span className="text-muted-foreground">Prazo entrega</span><span className="font-medium">{selectedQuote.shipping_deadline}</span></div>}
                {selectedQuote.proposal_validity && <div className="flex justify-between"><span className="text-muted-foreground">Validade</span><span className="font-medium">{selectedQuote.proposal_validity}</span></div>}
                {selectedQuote.notes && (
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground text-xs">Observações</span>
                    <p className="text-xs mt-1">{selectedQuote.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Client info */}
            {clientInfo && (
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Contato</h3>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">{clientInfo.company_name || clientInfo.name}</p>
                  {clientInfo.contact_name && (
                    <div className="flex items-center gap-1.5 text-muted-foreground"><User className="h-3.5 w-3.5" /> {clientInfo.contact_name}</div>
                  )}
                  {(clientInfo.phone || clientInfo.contact_phone) && (
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {clientInfo.phone || clientInfo.contact_phone}</div>
                  )}
                  {clientInfo.email && (
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {clientInfo.email}</div>
                  )}
                  {clientInfo.cpf_cnpj && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">CNPJ/CPF: {clientInfo.cpf_cnpj}</div>
                  )}
                  {(clientInfo.city || clientInfo.state) && (
                    <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {[clientInfo.city, clientInfo.state].filter(Boolean).join(' - ')}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Products */}
          <div className={`${isMobile ? '' : 'col-span-2'}`}>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="font-semibold text-sm mb-3">Produtos ({quoteItems.length})</h3>
              {quoteItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum produto nesta negociação</p>
              ) : (
                <div className="space-y-2">
                  {quoteItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.description}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {item.brand && <span>{item.brand}</span>}
                          {item.code && <span>Cód: {item.code}</span>}
                          <span>Qtd: {item.quantity || 1}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="font-semibold text-primary">{formatCurrency(parseFloat(String(item.line_total || item.unit_price || 0)))}</p>
                        {(item.quantity || 1) > 1 && item.unit_price && (
                          <p className="text-[10px] text-muted-foreground">{formatCurrency(parseFloat(String(item.unit_price)))} un.</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 border-t mt-2 font-semibold text-sm">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(parseFloat(String(selectedQuote.total_amount)) || 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // List view
  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">Negociações</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas negociações e acompanhe o funil</p>
        </div>
        <Button className="gap-2 min-h-[44px]" onClick={() => navigate('/quotes')}>
          <FileText className="h-4 w-4" /> Nova Negociação
        </Button>
      </div>

      {/* Filters */}
      <div className={`flex gap-2 mb-4 ${isMobile ? 'flex-col' : 'flex-wrap items-center'}`}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar negociação..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 min-h-[44px]" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] min-h-[44px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {canSeeAll && (
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Meus</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
              {sellers.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary cards */}
      <div className={`grid gap-3 mb-4 ${isMobile ? 'grid-cols-2' : 'grid-cols-5'}`}>
        {STAGES.map(stage => {
          const sq = filteredQuotes.filter(q => q.status === stage.key);
          const total = sq.reduce((s, q) => s + (parseFloat(String(q.total_amount)) || 0), 0);
          return (
            <button
              key={stage.key}
              onClick={() => setStatusFilter(statusFilter === stage.key ? 'all' : stage.key)}
              className={`rounded-xl border p-3 shadow-sm text-left transition-all ${statusFilter === stage.key ? 'ring-2 ring-primary bg-primary/5' : 'bg-card hover:bg-muted/30'}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <span className="text-xs font-semibold truncate">{stage.label}</span>
              </div>
              <p className="text-lg font-bold">{sq.length}</p>
              <p className="text-xs text-primary font-medium">{formatCurrency(total)}</p>
            </button>
          );
        })}
      </div>

      {/* Negotiation list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium">Nenhuma negociação encontrada</p>
          <p className="text-sm">Ajuste os filtros ou crie uma nova negociação</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuotes.map(q => {
            const stageIdx = getStageIndex(q.status);
            return (
              <button
                key={q.id}
                onClick={() => loadQuoteDetails(q)}
                className="w-full text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{q.quote_number}</span>
                      <Badge variant="secondary" className={`${getStatusColor(q.status)} text-white text-[10px]`}>
                        {getStatusLabel(q.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{q.client_name || 'Sem cliente'}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {q.created_at ? format(new Date(q.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</span>
                      {canSeeAll && q.created_by && (
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {getSellerName(q.created_by)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary">{formatCurrency(parseFloat(String(q.total_amount)) || 0)}</p>
                  </div>
                </div>
                {/* Mini stage bar */}
                <div className="flex gap-0.5 mt-3">
                  {STAGES.map((stage, idx) => (
                    <div
                      key={stage.key}
                      className={`h-1.5 flex-1 rounded-full ${idx <= stageIdx ? stage.color : 'bg-muted'}`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
