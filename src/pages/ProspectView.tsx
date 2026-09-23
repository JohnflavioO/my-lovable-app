import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FileText, 
  Search, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  MoreHorizontal, 
  ExternalLink, 
  MessageSquare, 
  Calendar,
  Filter,
  User,
  ArrowUpDown,
  RefreshCw
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import StatCard from '@/components/StatCard';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';


// Re-importing supabase to use typed version
import { supabase as supabaseClient } from '@/integrations/supabase/client';

const PROSPECT_STATUSES = [
  'pre_venda',
  'contato_feito',
  'sent',
  'proposta_enviada',
  'negociacao',
  'em_negociacao',
  'lancamento_rapido'
];

const statusLabels: Record<string, string> = {
  pre_venda: 'Pré-venda',
  contato_feito: 'Contato Feito',
  sent: 'Proposta Enviada',
  proposta_enviada: 'Proposta Enviada',
  negociacao: 'Negociação',
  em_negociacao: 'Em Negociação',
  lancamento_rapido: 'Lançamento Rápido'
};

const statusColors: Record<string, string> = {
  pre_venda: 'bg-sky-100 text-sky-800 border-sky-200',
  contato_feito: 'bg-blue-100 text-blue-800 border-blue-200',
  sent: 'bg-amber-100 text-amber-800 border-amber-200',
  proposta_enviada: 'bg-amber-100 text-amber-800 border-amber-200',
  negociacao: 'bg-purple-100 text-purple-800 border-purple-200',
  em_negociacao: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  lancamento_rapido: 'bg-orange-100 text-orange-800 border-orange-200'
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface ProspectQuote {
  id: string;
  quote_number: string;
  client_name: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  salesperson: string | null;
  client_id: string;
  salesperson_id: string | null;
  created_by: string | null;
  proposal_validity?: string;
  clients: {
    company_name: string;
    name: string;
    origin?: string;
  } | null;
}

export default function ProspectView() {
  const { user, isAdmin, isGestor } = useAuth();
  const [quotes, setQuotes] = useState<ProspectQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sellerFilter, setSellerFilter] = useState<string>('meus');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sellers, setSellers] = useState<{id: string, name: string}[]>([]);

  const loadData = useCallback(async () => {
    try {
      if (!user?.id) return;
      setLoading(true);
      
      const statusFilters = [
        'pre_venda', 'pre-venda', 'Pré Venda', 'Pré-venda',
        'contato_feito', 'contato_realizado', 'contato-feito', 'Contato Feito', 'Contato realizado', 'contato feito',
        'sent', 'proposta_enviada', 'proposta-enviada', 'Proposta Enviada', 'proposta enviada', 'Proposta enviada',
        'negociacao', 'em_negociacao', 'em-negociacao', 'Em Negociação', 'Negociação', 'negociação', 'Em negociação', 'negociacao',
        'lancamento_rapido', 'lancamento-rapido', 'Lançamento Rápido', 'lançamento rápido', 'Lançamento rápido', 'lancamento rapido'
      ];
      
      console.log('ProspectVision Log [INIT]:', {
        userId: user.id,
        role: isAdmin ? 'admin' : isGestor ? 'gestor' : 'sales',
        sellerFilter
      });

      // Simple query to avoid join errors, we already have client_name in quotes
      let query = supabaseClient.from('quotes')
        .select(`
          id, 
          quote_number, 
          client_name, 
          status, 
          total_amount, 
          created_at, 
          updated_at, 
          salesperson, 
          salesperson_id, 
          created_by,
          client_id
        `)
        .in('status', statusFilters)
        .order('created_at', { ascending: false });

      // Apply Role-based filtering
      if (isAdmin || isGestor) {
        if (sellerFilter === 'meus') {
          query = query.or(`salesperson_id.eq.${user.id},created_by.eq.${user.id}`);
        } else if (sellerFilter !== 'all') {
          query = query.eq('salesperson_id', sellerFilter);
        }
        // if 'all', no extra filters
      } else {
        // Regular Seller: Only their own
        query = query.or(`salesperson_id.eq.${user.id},created_by.eq.${user.id}`);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('ProspectVision Fetch Error:', error);
        throw error;
      }

      console.log('ProspectVision Log [SUCCESS]:', {
        count: data?.length || 0,
        sample: data?.slice(0, 1)
      });

      const mapped = (data || []).map((q: any) => ({
        ...q,
        client_name: q.client_name || 'Sem cliente',
        total_amount: parseFloat(String(q.total_amount || 0)) || 0,
        created_at: q.created_at || new Date().toISOString()
      }));

      setQuotes(mapped);

      // Extract unique sellers for filter (for Gestor and Admin)
      if (isAdmin || isGestor) {
        const { data: sellersData, error: sellersError } = await supabaseClient.from('quotes')
          .select('salesperson, salesperson_id')
          .in('status', statusFilters);
        
        if (sellersError) {
          console.error('ProspectVision Sellers Fetch Error:', sellersError);
        }
        
        const sellerMap = new Map();
        (sellersData || []).forEach((q: any) => {
          if (q.salesperson_id && q.salesperson) {
            sellerMap.set(q.salesperson_id, q.salesperson);
          }
        });
        
        const uniqueSellers = Array.from(sellerMap.entries()).map(([id, name]) => ({ id, name }));
        setSellers(uniqueSellers);
      }
    } catch (err: any) {
      console.error('ProspectView load error:', err);
      toast.error('Erro ao carregar dados: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAdmin, isGestor, sellerFilter]);



  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [loadData, user?.id]);

  const getPriority = (updatedAt: string, createdAt: string) => {
    const referenceDate = updatedAt || createdAt;
    const daysSinceInteraction = referenceDate ? Math.max(0, differenceInDays(new Date(), new Date(referenceDate))) : 999;
    
    if (daysSinceInteraction > 5) return { label: 'Urgente', color: 'bg-red-500', icon: AlertCircle, days: daysSinceInteraction, level: 'urgent' };
    if (daysSinceInteraction >= 2) return { label: 'Atenção', color: 'bg-yellow-500', icon: Clock, days: daysSinceInteraction, level: 'attention' };
    return { label: 'Saudável', color: 'bg-emerald-500', icon: CheckCircle2, days: daysSinceInteraction, level: 'healthy' };
  };

  const filteredAndSortedQuotes = useMemo(() => {
    let result = [...quotes];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(quote => 
        (quote.client_name && quote.client_name.toLowerCase().includes(q)) || 
        (quote.quote_number && quote.quote_number.toLowerCase().includes(q))
      );
    }

    // Filter consistency for frontend UI state
    if ((isAdmin || isGestor) && sellerFilter !== 'all' && sellerFilter !== 'meus') {
      result = result.filter(q => q.salesperson_id === sellerFilter);
    } else if (!(isAdmin || isGestor) || ((isAdmin || isGestor) && sellerFilter === 'meus')) {
      result = result.filter(q => q.salesperson_id === user?.id || q.created_by === user?.id);
    }

    // If isGestor and sellerFilter is 'all', we don't filter by salesperson




    if (statusFilter !== 'all') {
      result = result.filter(q => q.status === statusFilter);
    }
    if (priorityFilter !== 'all') {
      result = result.filter(q => getPriority(q.updated_at, q.created_at).level === priorityFilter);
    }

    // Default Sorting:
    // 1. Prioridade (tempo sem contato - descendente por dias)
    // 2. Maior Valor
    // 3. Mais Recente (criação)
    return result.sort((a, b) => {
      const dateA = a.updated_at || a.created_at;
      const dateB = b.updated_at || b.created_at;
      const daysA = dateA ? Math.max(0, differenceInDays(new Date(), new Date(dateA))) : 999;
      const daysB = dateB ? Math.max(0, differenceInDays(new Date(), new Date(dateB))) : 999;
      
      if (daysA !== daysB) return daysB - daysA;
      
      const valA = parseFloat(String(a.total_amount)) || 0;
      const valB = parseFloat(String(b.total_amount)) || 0;
      if (valA !== valB) return valB - valA;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [quotes, search, sellerFilter, statusFilter, priorityFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const totalOpen = filteredAndSortedQuotes.length;
    const totalValue = filteredAndSortedQuotes.reduce((sum, q) => sum + (parseFloat(String(q.total_amount)) || 0), 0);
    const urgentCount = filteredAndSortedQuotes.filter(q => getPriority(q.updated_at, q.created_at).level === 'urgent').length;
    const avgTicket = totalOpen > 0 ? totalValue / totalOpen : 0;

    return { totalOpen, totalValue, urgentCount, avgTicket };
  }, [filteredAndSortedQuotes]);

  const updateQuoteStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabaseClient.from('quotes').update({ 
        status: newStatus, 
        updated_at: new Date().toISOString() 
      }).eq('id', id);
      
      if (error) throw error;
      
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: newStatus, updated_at: new Date().toISOString() } : q));
      toast.success('Status atualizado');
    } catch (err) {
      toast.error('Erro ao atualizar status');
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Visão Prospect</h1>
            <p className="text-muted-foreground text-sm">Acompanhamento estratégico de oportunidades abertas</p>
          </div>
          <div className="flex items-center gap-2">
             <Button 
               variant="outline" 
               size="sm" 
               onClick={loadData} 
               disabled={loading}
               className="gap-2"
             >
               <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
               Sincronizar
             </Button>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total em Negociação" 
            value={metrics.totalOpen} 
            icon={FileText} 
          />
          <StatCard 
            title="Valor em Aberto" 
            value={formatCurrency(metrics.totalValue)} 
            icon={DollarSign} 
          />
          <StatCard 
            title="Urgentes" 
            value={metrics.urgentCount} 
            icon={AlertCircle}
            className={metrics.urgentCount > 0 ? "border-red-200 bg-red-50/30" : ""}
          />
          <StatCard 
            title="Ticket Médio" 
            value={formatCurrency(metrics.avgTicket)} 
            icon={TrendingUp} 
          />
        </div>

        {/* Filters */}
        <Card className="border-border/50 bg-muted/20">
          <CardContent className="p-4 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar cliente ou número..." 
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-3.5 w-3.5 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Fases Ativas</SelectItem>
                    {Object.entries(statusLabels)
                      .filter(([key], index, self) => self.findIndex(t => statusLabels[t[0]] === statusLabels[key]) === index)
                      .map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))
                    }
                  </SelectContent>
              </Select>

              {(isAdmin || isGestor) && (
                <Select value={sellerFilter} onValueChange={setSellerFilter}>
                  <SelectTrigger className="w-[160px]">
                    <User className="h-3.5 w-3.5 mr-2" />
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meus">Meus Prospects</SelectItem>
                    <SelectItem value="all">Equipe Toda</SelectItem>
                    {sellers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[140px]">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-2" />
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Prioridades</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                  <SelectItem value="attention">Atenção</SelectItem>
                  <SelectItem value="healthy">Saudável</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Opportunities List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedQuotes.map((quote) => {
            const priority = getPriority(quote.updated_at, quote.created_at);
            const PriorityIcon = priority.icon;
            
            return (
              <Card key={quote.id} className="group hover:shadow-md transition-all border-border/60 overflow-hidden">
                <div className={cn("h-1.5 w-full", priority.color)} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{quote.quote_number}</span>
                        <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0 h-4", statusColors[quote.status] || 'bg-slate-100 text-slate-800 border-slate-200')}>
                          {statusLabels[quote.status] || quote.status}
                        </Badge>
                      </div>
                      <h3 className="font-bold text-base truncate pr-2">{quote.client_name}</h3>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => window.open(`/quotes?edit=${quote.id}`, '_blank')}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir Proposta
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          navigator.clipboard.writeText(`Olá, gostaria de dar continuidade ao seu orçamento ${quote.quote_number}`);
                          toast.success('Texto base de follow-up copiado');
                        }}>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Iniciar Follow-up
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                          <Calendar className="h-4 w-4 mr-2" />
                          Registrar Contato
                        </DropdownMenuItem>
                        <div className="h-px bg-muted my-1" />
                        <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mudar Status</div>
                        {Object.entries(statusLabels).filter(([s]) => s !== quote.status).map(([s, label]) => (
                          <DropdownMenuItem key={s} onClick={() => updateQuoteStatus(quote.id, s)}>
                            Mover para {label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Valor</span>
                      <span className="text-sm font-bold text-primary">{formatCurrency(quote.total_amount)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 py-2 border-y border-border/50">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Vendedor</p>
                        <p className="text-xs font-medium truncate">{quote.salesperson || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Código</p>
                        <p className="text-xs font-medium truncate">{quote.quote_number}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <PriorityIcon className={cn("h-4 w-4", 
                          priority.level === 'urgent' ? 'text-red-500' : 
                          priority.level === 'attention' ? 'text-yellow-500' : 'text-emerald-500'
                        )} />
                        <span className="text-xs font-medium">
                          {priority.days === 0 ? 'Interação hoje' : `${priority.days} dias sem contato`}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        Criado em {format(new Date(quote.created_at), 'dd/MM/yy', { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredAndSortedQuotes.length === 0 && !loading && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/10 rounded-xl border border-dashed">
              <FileText className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium opacity-50">Nenhuma oportunidade encontrada</p>
              <p className="text-sm opacity-40">Tente ajustar seus filtros ou busca</p>
            </div>
          )}

          {loading && (
            <div className="col-span-full py-12 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
