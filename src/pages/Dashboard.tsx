import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { isToday, isBefore, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePrivacy } from '@/hooks/usePrivacy';
import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import PrivacyToggle from '@/components/PrivacyToggle';
import FollowUpAlerts from '@/components/FollowUpAlerts';
import RevenueForecasting from '@/components/RevenueForecasting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Users, DollarSign, TrendingUp, Clock, CheckCircle, XCircle, BarChart3, CreditCard, QrCode, FileBarChart, CircleDot, CheckCircle2, Plus, ClipboardList, ArrowUpRight, ChevronRight, Sparkles } from 'lucide-react';
import QuoteQuickViewModal from '@/components/QuoteQuickViewModal';
import StockLookup from '@/components/StockLookup';

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviado', approved: 'Aprovado', rejected: 'Rejeitado',
};
const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary', sent: 'default', approved: 'default', rejected: 'destructive',
};

const db = supabase as any;

const paymentMethodIcons: Record<string, { label: string; icon: any }> = {
  pix: { label: 'PIX', icon: QrCode },
  cartao: { label: 'Cartão', icon: CreditCard },
  boleto: { label: 'Boleto', icon: FileBarChart },
};

const paymentStatusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40' },
  em_andamento: { label: 'Em andamento', icon: CircleDot, className: 'bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40' },
  liquidado: { label: 'Liquidado', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40' },
  faturado: { label: 'Faturado', icon: CheckCircle2, className: 'bg-purple-50 text-purple-700 border-purple-200/60 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/40' },
};

interface SellerInfo {
  user_id: string;
  full_name: string;
  clients_count?: number;
  quotes_count?: number;
  total_value?: number;
  approved_count?: number;
  pending_count?: number;
  rejected_count?: number;
}

interface TopClientInfo {
  name: string;
  total: number;
  count: number;
}

function computeStats(quotes: any[]) {
  const totalValue = quotes.reduce((sum: number, q: any) => sum + (parseFloat(q.total_amount) || parseFloat(q.total) || 0), 0);
  const approved = quotes.filter((q: any) => q.status === 'approved').length;
  const pending = quotes.filter((q: any) => ['draft', 'sent', 'pre_venda', 'pre_sale', 'contato_feito', 'contact_made', 'negociacao', 'negotiation'].includes(q.status)).length;
  const rejected = quotes.filter((q: any) => q.status === 'rejected').length;
  return {
    quotes: quotes.length,
    totalValue,
    approved,
    pending,
    rejected,
    avgTicket: quotes.length > 0 ? totalValue / quotes.length : 0,
  };
}

function computeTopClients(quotes: any[]) {
  const clientMap: Record<string, { name: string; total: number; count: number }> = {};
  quotes.forEach((q: any) => {
    if (q.client_id) {
      if (!clientMap[q.client_id]) clientMap[q.client_id] = { name: q.clients?.company_name || q.client_name || '', total: 0, count: 0 };
      clientMap[q.client_id].total += parseFloat(q.total_amount) || parseFloat(q.total) || 0;
      clientMap[q.client_id].count++;
    }
  });
  return Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 5);
}

export default function Dashboard() {
  const { user, isGestor, isAdmin, loading: authLoading } = useAuth();
  const { maskValue, formatCurrency: privacyFormat } = usePrivacy();
  const navigate = useNavigate();
  const canSeeTeam = isGestor;

  const [allQuotes, setAllQuotes] = useState<any[]>([]);
  const [myClientsCount, setMyClientsCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [sellers, setSellers] = useState<SellerInfo[]>([]);
  const [teamFilter, setTeamFilter] = useState('all');
  const [teamRecentQuotes, setTeamRecentQuotes] = useState<any[]>([]);
  const [teamTopClients, setTeamTopClients] = useState<TopClientInfo[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [detailsModal, setDetailsModal] = useState<{
    open: boolean;
    title: string;
    vendedor?: string;
    quotes?: any[];
    clients?: any[];
    stats?: { total: number; count: number; avg: number };
  }>({ open: false, title: '' });

  const openDetails = (title: string, data: { quotes?: any[]; clientsCount?: number; vendedor?: string; stats?: any }) => {
    const currentVendedor = data.vendedor || (teamFilter === 'all' ? 'Time Inteiro' : (sellers.find(s => s.user_id === teamFilter)?.full_name || 'Vendedor Selecionado'));
    setDetailsModal({
      open: true,
      title,
      vendedor: currentVendedor,
      quotes: data.quotes,
      stats: data.stats
    });
  };

  useEffect(() => {
    const loadOwnData = async () => {
      if (!user?.id) return;

      try {
        const [quotesRes, clientsRes, productsRes] = await Promise.all([
          db.from('quotes').select('id, quote_number, status, client_name, total_amount, shipping_cost, payment_method, payment_status, created_at, created_by, clients(company_name)').eq('created_by', user.id).order('created_at', { ascending: false }).limit(50),
          db.from('clients').select('id', { count: 'exact', head: true }).eq('created_by', user.id),
          db.from('products').select('id', { count: 'exact', head: true }),
        ]);

        if (quotesRes.data) setAllQuotes(quotesRes.data);
        if (clientsRes.count !== null) setMyClientsCount(clientsRes.count);
        if (productsRes.count !== null) setProductsCount(productsRes.count);
      } catch (err) {
        console.error('[Dashboard] loadOwnData error:', err);
      }
    };

    if (user?.id) loadOwnData();
  }, [user?.id]);

  useEffect(() => {
    const loadTeamData = async () => {
      if (!canSeeTeam || !user?.id) {
        setDataLoading(false);
        return;
      }

      setDataLoading(true);
      try {
        const activeOwner = teamFilter === 'all' ? null : teamFilter;

        const [sellerStatsRes, recentRes, topClientsRes] = await Promise.all([
          db.rpc('get_team_dashboard_sellers'),
          db.rpc('get_team_dashboard_recent_quotes', { p_owner: activeOwner, p_limit: 500 }),
          db.rpc('get_team_dashboard_top_clients', { p_owner: activeOwner, p_limit: 5 }),
        ]);

        if (sellerStatsRes.data) {
          const sellerRows = sellerStatsRes.data.filter((seller: any) => seller?.full_name);
          setSellers(sellerRows);
        }
        
        if (recentRes.data) setTeamRecentQuotes(recentRes.data);
        
        if (topClientsRes.data) {
          setTeamTopClients(
            (topClientsRes.data as any[]).map((client) => ({
              name: client.client_name || 'Sem nome',
              total: Number(client.total_value) || 0,
              count: Number(client.quotes_count) || 0,
            }))
          );
        }
      } catch (err) {
        console.error('[Dashboard] loadTeamData error:', err);
      } finally {
        setDataLoading(false);
      }
    };

    if (canSeeTeam) loadTeamData();
    else setDataLoading(false);
  }, [canSeeTeam, teamFilter, user?.id]);

  useEffect(() => {
    if (!authLoading && !canSeeTeam && teamFilter !== 'all') {
      setTeamFilter('all');
    }

    if (!authLoading && canSeeTeam && teamFilter !== 'all' && sellers.length > 0 && !sellers.some((seller) => seller.user_id === teamFilter)) {
      setTeamFilter('all');
    }
  }, [canSeeTeam, sellers, teamFilter, authLoading]);

  const myQuotes = allQuotes;
  const selectedTeamSellers = useMemo(
    () => {
      if (!Array.isArray(sellers)) return [];
      return (teamFilter === 'all' ? sellers : sellers.filter((seller) => seller?.user_id === teamFilter));
    },
    [sellers, teamFilter],
  );

  const myStats = useMemo(() => computeStats(Array.isArray(myQuotes) ? myQuotes : []), [myQuotes]);
  
  const teamStats = useMemo(() => {
    if (!Array.isArray(selectedTeamSellers)) return { quotes: 0, totalValue: 0, approved: 0, pending: 0, rejected: 0, avgTicket: 0 };
    
    const quotes = selectedTeamSellers.reduce((sum, seller) => sum + Number(seller?.quotes_count || 0), 0);
    const totalValue = selectedTeamSellers.reduce((sum, seller) => sum + Number(seller?.total_value || 0), 0);
    const approved = selectedTeamSellers.reduce((sum, seller) => sum + Number(seller?.approved_count || 0), 0);
    const pending = selectedTeamSellers.reduce((sum, seller) => sum + Number(seller?.pending_count || 0), 0);
    const rejected = selectedTeamSellers.reduce((sum, seller) => sum + Number(seller?.rejected_count || 0), 0);

    return {
      quotes,
      totalValue,
      approved,
      pending,
      rejected,
      avgTicket: quotes > 0 ? totalValue / quotes : 0,
    };
  }, [selectedTeamSellers]);

  const teamClientsCount = useMemo(
    () => {
      if (!Array.isArray(selectedTeamSellers)) return 0;
      return selectedTeamSellers.reduce((sum, seller) => sum + Number(seller?.clients_count || 0), 0);
    },
    [selectedTeamSellers],
  );
  const teamQuotes = teamRecentQuotes;
  const teamRecent = teamRecentQuotes.slice(0, 8);
  const myTopClients = computeTopClients(myQuotes);
  const myRecent = myQuotes.slice(0, 8);

  const formatCurrency = (v: number) => privacyFormat(v);

  const getSellerName = (userId: string) => {
    const s = sellers.find(s => s.user_id === userId);
    return s?.full_name || 'Desconhecido';
  };

  const renderQuoteRow = (q: any, showSeller = false) => {
    const pmConfig = paymentMethodIcons[q.payment_method];
    const psConfig = paymentStatusConfig[q.payment_status] || paymentStatusConfig.pendente;
    const PsIcon = psConfig.icon;
    const clientLabel = q.clients?.company_name || q.client_name || 'Sem cliente';
    const clientPhone = q.clients?.phone;
    return (
      <button
        key={q.id}
        type="button"
        onClick={() => setQuickViewId(q.id)}
        className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card hover:bg-accent/50 gap-3 transition-all duration-200 border border-border/60 hover:border-primary/40 shadow-sm hover:shadow group cursor-pointer"
      >
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              {q.quote_number}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(q.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground truncate max-w-full" title={clientLabel}>
            {clientLabel}
          </p>
          {clientPhone && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{clientPhone}</p>}
          {showSeller && <p className="text-[11px] text-muted-foreground italic font-medium mt-0.5">Vendedor: {getSellerName(q.created_by)}</p>}
        </div>
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {pmConfig && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-md">
              <pmConfig.icon className="h-3 w-3" /> {pmConfig.label}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border font-medium ${psConfig.className}`}>
            <PsIcon className="h-3 w-3" /> {psConfig.label}
          </span>
          {parseFloat(q.shipping_cost) > 0 && (
            <span className="text-xs text-muted-foreground hidden md:inline">Frete: {maskValue(parseFloat(q.shipping_cost))}</span>
          )}
          <span className="text-sm font-semibold text-foreground tabular-nums">{maskValue(parseFloat(q.total_amount) || 0)}</span>
          <Badge variant={statusVariants[q.status] || 'secondary'}
            className={q.status === 'approved' ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' : ''}>
            {statusLabels[q.status] || q.status}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </div>
      </button>
    );
  };

  const renderStatsBlock = (stats: any, clientsCount: number, isTeam = false) => {
    const vendedorNome = isTeam ? (teamFilter === 'all' ? 'Time Inteiro' : sellers.find(s => s.user_id === teamFilter)?.full_name) : 'Eu';
    
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 md:gap-4 mb-3.5 md:mb-4">
          <StatCard 
            title="Total Orçamentos" 
            value={stats.quotes} 
            icon={FileText} 
            onClick={() => {
              if (isTeam) {
                openDetails("Total de Orçamentos", { quotes: teamRecentQuotes, vendedor: vendedorNome });
              } else {
                navigate('/quotes');
              }
            }}
          />
          <StatCard 
            title="Clientes" 
            value={clientsCount} 
            icon={Users} 
            onClick={() => {
              if (isTeam) {
                openDetails("Lista de Clientes", { vendedor: vendedorNome });
              } else {
                navigate('/clients');
              }
            }}
          />
          <StatCard 
            title="Valor Total" 
            value={stats.totalValue} 
            isCurrency={true}
            icon={DollarSign} 
            onClick={() => {
              if (isTeam) {
                openDetails("Composição do Valor Total", { quotes: teamRecentQuotes, vendedor: vendedorNome });
              } else {
                navigate('/quotes');
              }
            }}
          />
          <StatCard 
            title="Ticket Médio" 
            value={stats.avgTicket} 
            isCurrency={true}
            icon={BarChart3} 
            onClick={() => {
              if (isTeam) {
                openDetails("Análise de Ticket Médio", { 
                  quotes: teamRecentQuotes, 
                  vendedor: vendedorNome,
                  stats: { total: stats.totalValue, count: stats.quotes, avg: stats.avgTicket }
                });
              } else {
                navigate('/metrics');
              }
            }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 md:gap-4 mb-6">
          <StatCard 
            title="Aprovados" 
            value={stats.approved} 
            icon={CheckCircle} 
            className="border-l-4 border-l-emerald-500 shadow-sm" 
            onClick={() => {
              if (isTeam) {
                const filtered = teamRecentQuotes.filter(q => q.status === 'approved');
                openDetails("Orçamentos Aprovados", { quotes: filtered, vendedor: vendedorNome });
              } else {
                navigate('/quotes?status=approved');
              }
            }}
          />
          <StatCard 
            title="Pendentes" 
            value={stats.pending} 
            icon={Clock} 
            className="border-l-4 border-l-amber-500 shadow-sm" 
            onClick={() => {
              if (isTeam) {
                const filtered = teamRecentQuotes.filter(q => ['draft', 'sent', 'pre_venda', 'pre_sale', 'contato_feito', 'contact_made', 'negociacao', 'negotiation'].includes(q.status));
                openDetails("Orçamentos Pendentes", { quotes: filtered, vendedor: vendedorNome });
              } else {
                navigate('/quotes?status=pending');
              }
            }}
          />
          <StatCard 
            title="Rejeitados" 
            value={stats.rejected} 
            icon={XCircle} 
            className="border-l-4 border-l-rose-500 shadow-sm" 
            onClick={() => {
              if (isTeam) {
                const filtered = teamRecentQuotes.filter(q => q.status === 'rejected');
                openDetails("Orçamentos Rejeitados", { quotes: filtered, vendedor: vendedorNome });
              } else {
                navigate('/quotes?status=rejected');
              }
            }}
          />
          <StatCard 
            title="Produtos" 
            value={productsCount} 
            icon={TrendingUp} 
            className="border-l-4 border-l-indigo-500 shadow-sm" 
            onClick={() => navigate('/products')}
          />
        </div>
      </>
    );
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!canSeeTeam) {
    return (
      <AppLayout>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Painel Comercial</span>
            </div>
            <h1 className="text-2xl font-bold font-display tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Visão geral do seu desempenho e propostas</p>
          </div>
          <div className="flex items-center flex-wrap gap-2.5">
            <PrivacyToggle />
            <Button variant="outline" onClick={() => navigate('/reports')} className="gap-2 min-h-[42px] border-primary/40 text-primary hover:bg-primary/5">
              <ClipboardList className="h-4 w-4" /> Relatórios
            </Button>
            <Button onClick={() => navigate('/quotes')} className="gap-2 min-h-[42px] shadow-sm">
              <Plus className="h-4 w-4" /> Criar Proposta
            </Button>
            <StockLookup />
          </div>
        </div>

        {renderStatsBlock(myStats, myClientsCount)}

        <div className="mb-6">
          <Card className="shadow-sm border border-border/60 overflow-hidden bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Previsão de Faturamento
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <RevenueForecasting quotes={myQuotes} />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="shadow-sm border border-border/60 lg:col-span-2">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="font-display text-base">Últimos Orçamentos</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {myRecent.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Nenhum orçamento criado ainda</p>
                </div>
              ) : (
                <div className="space-y-2.5">{myRecent.map(q => renderQuoteRow(q))}</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-border/60">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="font-display text-base">Top Clientes</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {myTopClients.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Sem dados suficientes</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myTopClients.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">{c.name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground">{c.count} {c.count === 1 ? 'orçamento' : 'orçamentos'}</p>
                      </div>
                      <span className="text-sm font-bold text-primary">{formatCurrency(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          <FollowUpAlerts />
        </div>
        <QuoteQuickViewModal quoteId={quickViewId} open={!!quickViewId} onOpenChange={(v) => !v && setQuickViewId(null)} />
      </AppLayout>
    );
  }

  const teamPendingFollowUps = Array.isArray(teamRecentQuotes) ? teamRecentQuotes.filter(q => {
    if (!q.followup_date) return false;
    try {
      const dateStr = String(q.followup_date).includes('T') ? q.followup_date : `${q.followup_date}T12:00:00`;
      const date = new Date(dateStr);
      return isToday(date) || isBefore(date, startOfDay(new Date()));
    } catch (e) {
      return false;
    }
  }).length : 0;

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Painel Gerencial</span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Visão consolidada dos seus resultados e da equipe</p>
        </div>
        <div className="flex items-center flex-wrap gap-2.5">
          <PrivacyToggle />
          <Button variant="outline" onClick={() => navigate('/reports')} className="gap-2 min-h-[42px] border-primary/40 text-primary hover:bg-primary/5">
            <ClipboardList className="h-4 w-4" /> Relatórios
          </Button>
          <Button onClick={() => navigate('/quotes')} className="gap-2 min-h-[42px] shadow-sm">
            <Plus className="h-4 w-4" /> Criar Proposta
          </Button>
          <StockLookup />
        </div>
      </div>

      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold font-display">Meus Resultados</h2>
            <p className="text-muted-foreground text-xs">Seus indicadores pessoais</p>
          </div>
        </div>

        {renderStatsBlock(myStats, myClientsCount)}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="shadow-sm border border-border/60 lg:col-span-2">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="font-display text-base">Meus Últimos Orçamentos</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {myRecent.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Nenhum orçamento criado ainda</p>
                </div>
              ) : (
                <div className="space-y-2.5">{myRecent.map(q => renderQuoteRow(q))}</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-border/60">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="font-display text-base">Meus Top Clientes</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {myTopClients.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Sem dados suficientes</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myTopClients.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">{c.name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground">{c.count} {c.count === 1 ? 'orçamento' : 'orçamentos'}</p>
                      </div>
                      <span className="text-sm font-bold text-primary">{formatCurrency(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="border-t border-border/80 pt-8 mt-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-display">Dashboard do Time</h2>
              {teamPendingFollowUps > 0 && (
                <Badge variant="destructive" className="text-[10px] px-2 py-0.5 animate-pulse">
                  {teamPendingFollowUps} follow-ups pendentes
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs mt-0.5">Visão geral unificada de toda a equipe comercial</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-full md:w-60">
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="min-h-[42px] bg-card"><SelectValue placeholder="Filtrar Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Vendedores</SelectItem>
                  {sellers.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {renderStatsBlock(teamStats, teamClientsCount, true)}
  
        <div className="mb-6">
          <Card className="shadow-sm border border-border/60 overflow-hidden bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Previsão de Faturamento (Time)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <RevenueForecasting 
                quotes={teamQuotes} 
                onCardClick={(label, quotes) => openDetails(label, { quotes })}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="shadow-sm border border-border/60 lg:col-span-2">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="font-display text-base">Últimos Orçamentos — Time</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {teamRecent.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Nenhum orçamento encontrado</p>
                </div>
              ) : (
                <div className="space-y-2.5">{teamRecent.map(q => renderQuoteRow(q, true))}</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-border/60">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="font-display text-base">Top Clientes — Time</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {teamTopClients.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Sem dados suficientes</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {teamTopClients.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">{c.name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground">{c.count} {c.count === 1 ? 'orçamento' : 'orçamentos'}</p>
                      </div>
                      <span className="text-sm font-bold text-primary">{formatCurrency(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mb-10">
          <FollowUpAlerts />
        </div>
      </div>

      <Dialog open={detailsModal.open} onOpenChange={(open) => setDetailsModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-2 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-display">{detailsModal.title}</DialogTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="font-normal">Vendedor: {detailsModal.vendedor}</Badge>
                  {detailsModal.quotes && (
                    <Badge variant="secondary" className="font-normal">{detailsModal.quotes.length} registros</Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-4">
            {detailsModal.stats && (
              <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-muted/40 rounded-xl border">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Valor Acumulado</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(detailsModal.stats.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Quantidade</p>
                  <p className="text-lg font-bold">{detailsModal.stats.count} orçamentos</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Ticket Médio</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(detailsModal.stats.avg)}</p>
                </div>
              </div>
            )}

            {detailsModal.quotes && detailsModal.quotes.length > 0 ? (
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Número</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsModal.quotes.map((q) => (
                      <TableRow key={q.id} className="hover:bg-muted/30">
                        <TableCell className="font-semibold text-xs text-primary">{q.quote_number}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate font-medium">{q.clients?.company_name || q.client_name || 'Sem cliente'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{getSellerName(q.created_by)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[q.status] || 'secondary'} className="text-[10px] px-2 py-0.5">
                            {statusLabels[q.status] || q.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold">{formatCurrency(parseFloat(q.total_amount) || 0)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => navigate('/quotes')}>
                            <ArrowUpRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <p className="text-sm">Nenhum detalhe disponível para este indicador no momento.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <QuoteQuickViewModal quoteId={quickViewId} open={!!quickViewId} onOpenChange={(v) => !v && setQuickViewId(null)} />
    </AppLayout>
  );
}