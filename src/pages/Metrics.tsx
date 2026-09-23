import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePrivacy } from '@/hooks/usePrivacy';
import AppLayout from '@/components/AppLayout';
import PrivacyToggle from '@/components/PrivacyToggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, subMonths, differenceInDays, eachDayOfInterval, eachWeekOfInterval, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  BarChart3, TrendingUp, DollarSign,
  CalendarDays, Target, Grid3X3, BarChart2, Users, Check, ChevronDown
} from 'lucide-react';
import { isPartnershipPayment } from '@/lib/quotePaymentValidation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SellerComparison from '@/components/SellerComparison';

const db = supabase as any;

const COLORS = ['#15AFA1', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  const formatCompact = (v: number) => {
    if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
    return `R$ ${v.toFixed(0)}`;
  };


type Period = 'month' | '3months' | '6months' | 'custom';
type ChartView = 'bar' | 'table';
type ChartMetric = 'quantity' | 'value';

const formatCompactCurrency = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  if (abs >= 10_000) return `R$ ${(value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function Metrics() {
  const { user, isGestor, isAdmin } = useAuth();
  const { maskValue, formatCurrency, isHidden } = usePrivacy();
  const canSeeAll = isGestor; // Only Gestor can see all and filter
  const isOnlyAdmin = isAdmin && !isGestor;
  const [quotes, setQuotes] = useState<any[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date | undefined>(new Date());
  const [chartView, setChartView] = useState<ChartView>('bar');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('quantity');
  const [sellers, setSellers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    if (period === '3months') return { from: startOfMonth(subMonths(now, 2)), to: now };
    if (period === '6months') return { from: startOfMonth(subMonths(now, 5)), to: now };
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    const loadSellers = async () => {
      if (!canSeeAll) return;
      const { data } = await db.from('profiles')
        .select('user_id, full_name')
        .eq('active', true)
        .in('role', ['vendedor', 'comercial', 'gestor', 'admin']);
      
      if (data) {
        // Sort: current user first, then others by name
        const sorted = [...data].sort((a, b) => {
          if (a.user_id === user?.id) return -1;
          if (b.user_id === user?.id) return 1;
          return a.full_name.localeCompare(b.full_name);
        });
        setSellers(sorted);
        // Default to current user for Gestor/Admin
        setSelectedSellerIds([user?.id || '']);
      }
    };
    loadSellers();
  }, [canSeeAll, user?.id]);

  useEffect(() => {
    const load = async () => {
      let query = db.from('quotes')
        .select('id, quote_number, client_name, total, total_amount, status, payment_status, payment_method, is_split_payment, split_method_1, split_method_2, quote_date, created_at, created_by, salesperson')
        .gte('quote_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('quote_date', format(dateRange.to, 'yyyy-MM-dd'));

      if (!canSeeAll && !isOnlyAdmin) {
        query = query.eq('created_by', user?.id);
      } else if (canSeeAll && selectedSellerIds.length > 0) {
        query = query.in('created_by', selectedSellerIds);
      } else if (isOnlyAdmin) {
        query = query.eq('created_by', user?.id);
      }

      const { data, error } = await query.order('quote_date', { ascending: true });
      if (error) {
        console.error('[Metrics] Error loading quotes:', error);
        toast.error('Erro ao carregar métricas');
      }
      setQuotes(data || []);
    };
    load();
  }, [dateRange, user?.id, canSeeAll, selectedSellerIds, isOnlyAdmin]);


  const totalQuotes = quotes.length;
  const approved = quotes.filter(q => q.status === 'approved' && !isPartnershipPayment(q as any));
  const rejected = quotes.filter(q => q.status === 'rejected');
  const inNegotiation = quotes.filter(q => !['approved', 'rejected'].includes(q.status));
  const totalRevenue = approved.reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0);
  const totalLost = rejected.reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0);
  const totalInNegotiation = inNegotiation.reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0);
  const avgTicket = approved.length > 0 ? totalRevenue / approved.length : 0;
  const conversionRate = totalQuotes > 0 ? (approved.length / totalQuotes) * 100 : 0;
  const totalUnits = approved.length;

  const avgDaysToSale = useMemo(() => {
    if (approved.length === 0) return 0;
    const totalDays = approved.reduce((sum: number, q: any) => {
      const created = parseISO(q.created_at);
      const quoteDate = parseISO(q.quote_date);
      return sum + Math.max(0, differenceInDays(quoteDate, created));
    }, 0);
    return Math.round(totalDays / approved.length);
  }, [approved]);

  const avgDaysToLoss = useMemo(() => {
    if (rejected.length === 0) return 0;
    const totalDays = rejected.reduce((sum: number, q: any) => {
      const created = parseISO(q.created_at);
      const quoteDate = parseISO(q.quote_date);
      return sum + Math.max(0, differenceInDays(quoteDate, created));
    }, 0);
    return Math.round(totalDays / rejected.length);
  }, [rejected]);

  const periodChartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const groupByWeek = days.length > 45;

    if (groupByWeek) {
      try {
        const weeks = eachWeekOfInterval({ start: dateRange.from, end: dateRange.to }, { weekStartsOn: 1 });
        return weeks.map(weekStart => {
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
          const weekQuotes = quotes.filter(q => {
            const d = parseISO(q.quote_date);
            return isWithinInterval(d, { start: weekStart, end: weekEnd });
          });
          return {
            label: format(weekStart, 'dd/MM'),
            criados: weekQuotes.length,
            vendidos: weekQuotes.filter(q => q.status === 'approved').length,
            perdidos: weekQuotes.filter(q => q.status === 'rejected').length,
            valorVendido: weekQuotes.filter(q => q.status === 'approved').reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0),
            valorPerdido: weekQuotes.filter(q => q.status === 'rejected').reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0),
          };
        });
      } catch { return []; }
    }

    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayQuotes = quotes.filter(q => q.quote_date === dayStr);
      return {
        label: format(day, 'dd/MM'),
        criados: dayQuotes.length,
        vendidos: dayQuotes.filter(q => q.status === 'approved').length,
        perdidos: dayQuotes.filter(q => q.status === 'rejected').length,
        valorVendido: dayQuotes.filter(q => q.status === 'approved').reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0),
        valorPerdido: dayQuotes.filter(q => q.status === 'rejected').reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0),
      };
    }).filter(d => d.criados > 0 || d.vendidos > 0 || d.perdidos > 0);
  }, [quotes, dateRange]);

  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    quotes.forEach(q => {
      const label = q.status === 'approved' ? 'Aprovado' : q.status === 'rejected' ? 'Rejeitado' : q.status === 'sent' ? 'Enviado' : 'Rascunho';
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [quotes]);

  const paymentData = useMemo(() => {
    const map: Record<string, number> = {};
    approved.forEach(q => {
      const method = q.payment_method === 'pix' ? 'PIX' : q.payment_method === 'cartao' ? 'Cartão' : q.payment_method === 'boleto' ? 'Boleto' : q.payment_method === 'parceria' ? 'Parceria' : 'Outros';
      map[method] = (map[method] || 0) + (q.total_amount || q.total || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [approved]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-sm" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' && p.value > 100 ? maskValue(p.value) : p.value}
          </p>
        ))}
      </div>
    );
  };

  const handleExportCSV = () => {
    if (!quotes.length) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    const headers = ['Data', 'Numero', 'Cliente', 'Status', 'Pagamento', 'Metodo', 'Vendedor', 'Valor'];
    const csvContent = [
      headers.join(';'),
      ...quotes.map(q => [
        format(parseISO(q.quote_date), 'dd/MM/yyyy'),
        q.quote_number,
        `"${q.client_name}"`,
        q.status,
        q.payment_status,
        q.payment_method,
        `"${q.salesperson || ''}"`,
        (q.total_amount || q.total || 0).toString().replace('.', ',')
      ].join(';'))
    ].join('\n');
    
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `metricas_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Planilha exportada com sucesso!');
  };


  return (
    <AppLayout>
      {isGestor ? (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="sellers">Comparativo de Vendedores</TabsTrigger>
          </TabsList>
          <TabsContent value="sellers" className="mt-0">
            <SellerComparison />
          </TabsContent>
          <TabsContent value="overview" className="mt-0">
            <MetricsOverview />
          </TabsContent>
        </Tabs>
      ) : (
        <MetricsOverview />
      )}
    </AppLayout>
  );

  function MetricsOverview() { return (<>
      <div className="mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <h1 className="text-xl md:text-2xl font-bold font-display">Negociações concluídas</h1>
            <div className="sm:hidden">
              <PrivacyToggle />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <PrivacyToggle />
            </div>
            <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 gap-2 flex-1 sm:flex-none" onClick={handleExportCSV}>
              <Grid3X3 className="h-4 w-4" />
              Exportar para Planilha
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <Select value={period} onValueChange={v => setPeriod(v as Period)}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background min-h-[44px]">
              <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="3months">Últimos 3 meses</SelectItem>
              <SelectItem value="6months">Últimos 6 meses</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {canSeeAll && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-[250px] justify-between bg-background min-h-[44px]">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      {selectedSellerIds.length === 0 
                        ? "Todos os Vendedores" 
                        : selectedSellerIds.length === 1 
                          ? sellers.find(s => s.user_id === selectedSellerIds[0])?.full_name 
                          : `${selectedSellerIds.length} selecionados`}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-2" align="start">
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  <div 
                    className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors"
                    onClick={() => setSelectedSellerIds([])}
                  >
                    <Checkbox id="seller-all" checked={selectedSellerIds.length === 0} />
                    <Label htmlFor="seller-all" className="flex-1 cursor-pointer font-medium">Todos</Label>
                    {selectedSellerIds.length === 0 && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="h-px bg-muted my-1" />
                  {sellers.map((s) => (
                    <div 
                      key={s.user_id}
                      className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedSellerIds(prev => 
                          prev.includes(s.user_id) 
                            ? prev.filter(id => id !== s.user_id)
                            : [...prev, s.user_id]
                        );
                      }}
                    >
                      <Checkbox id={`seller-${s.user_id}`} checked={selectedSellerIds.includes(s.user_id)} />
                      <Label htmlFor={`seller-${s.user_id}`} className="flex-1 cursor-pointer truncate">
                        {s.full_name} {s.user_id === user?.id && <span className="text-[10px] text-muted-foreground">(você)</span>}
                      </Label>
                      {selectedSellerIds.includes(s.user_id) && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {period === 'custom' && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("min-h-[44px] flex-1 sm:flex-none", !customFrom && 'text-muted-foreground')}>
                    {customFrom ? format(customFrom, 'dd/MM/yyyy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("min-h-[44px] flex-1 sm:flex-none", !customTo && 'text-muted-foreground')}>
                    {customTo ? format(customTo, 'dd/MM/yyyy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4 mb-3 md:mb-4">
        <Card className="bg-emerald-50 border-emerald-100 overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-emerald-700 mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Negociações criadas</p>
            <p className="text-2xl md:text-3xl font-bold text-emerald-900 leading-none tabular-nums">{totalQuotes}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-100 overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-amber-700 mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Em Negociação</p>
            <p className="text-lg md:text-2xl font-bold text-amber-900 leading-none tabular-nums truncate" title={formatCurrency(totalInNegotiation)}>{maskValue(formatCompactCurrency(totalInNegotiation))}</p>
            <p className="text-[10px] md:text-xs text-amber-600 mt-1 truncate">{inNegotiation.length} negociação(ões)</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100 overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-emerald-700 mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Negociações vendidas</p>
            <p className="text-2xl md:text-3xl font-bold text-emerald-900 leading-none tabular-nums">{approved.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-100 overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-red-700 mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Negociações perdidas</p>
            <p className="text-2xl md:text-3xl font-bold text-red-900 leading-none tabular-nums">{rejected.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-background border overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-muted-foreground mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Tempo médio venda</p>
            <p className="text-2xl md:text-3xl font-bold leading-none tabular-nums">{avgDaysToSale}<span className="text-xs font-normal text-muted-foreground ml-1">dias</span></p>
          </CardContent>
        </Card>
        <Card className="bg-background border col-span-2 lg:col-span-1 overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-muted-foreground mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Tempo médio perda</p>
            <p className="text-2xl md:text-3xl font-bold leading-none tabular-nums">{avgDaysToLoss}<span className="text-xs font-normal text-muted-foreground ml-1">dias</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <Card className="bg-background border overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-muted-foreground mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Valor vendido</p>
            <p className="text-lg md:text-2xl font-bold leading-none tabular-nums truncate" title={formatCurrency(totalRevenue)}>{formatCompactCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-background border overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-muted-foreground mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Ticket médio</p>
            <p className="text-lg md:text-2xl font-bold leading-none tabular-nums truncate" title={formatCurrency(avgTicket)}>{formatCompactCurrency(avgTicket)}</p>
          </CardContent>
        </Card>
        <Card className="bg-background border overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-muted-foreground mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Unidades vendidas</p>
            <p className="text-lg md:text-2xl font-bold leading-none tabular-nums">{totalUnits}</p>
          </CardContent>
        </Card>
        <Card className="bg-background border overflow-hidden">
          <CardContent className="p-3 md:p-4 min-w-0">
            <p className="text-[11px] md:text-xs text-muted-foreground mb-1 leading-tight line-clamp-2 min-h-[2.2em]">Valor perdido</p>
            <p className="text-lg md:text-2xl font-bold leading-none tabular-nums truncate" title={formatCurrency(totalLost)}>{formatCompactCurrency(totalLost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main chart */}
      <Card className="mb-4 md:mb-6 shadow-card">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm md:text-base">Negociações criadas, vendidas e perdidas</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Atualizado em {format(new Date(), "dd/MM/yyyy, HH:mm:ss")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={chartMetric} onValueChange={v => setChartMetric(v as ChartMetric)}>
                <SelectTrigger className="w-[160px] sm:w-[200px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quantity">Quantidade</SelectItem>
                  <SelectItem value="value">Valor</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex border rounded-md overflow-hidden">
                <button
                  onClick={() => setChartView('bar')}
                  className={cn("p-1.5 transition-colors", chartView === 'bar' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
                >
                  <BarChart2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setChartView('table')}
                  className={cn("p-1.5 transition-colors", chartView === 'table' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartView === 'bar' ? (
            periodChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                {chartMetric === 'quantity' ? (
                  <BarChart data={periodChartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="criados" name="Criados" fill="#15AFA1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="vendidos" name="Vendidos" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="perdidos" name="Perdidos" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={periodChartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={v => formatCompact(v)} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="valorVendido" name="Valor Vendido" fill="#15AFA1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="valorPerdido" name="Valor Perdido" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">Sem dados no período</div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Período</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Criados</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Vendidos</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Perdidos</th>
                    {chartMetric === 'value' && (
                      <>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">V. Vendido</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">V. Perdido</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {periodChartData.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3">{row.label}</td>
                      <td className="text-right py-2 px-3">{row.criados}</td>
                      <td className="text-right py-2 px-3 text-blue-600">{row.vendidos}</td>
                      <td className="text-right py-2 px-3 text-red-500">{row.perdidos}</td>
                      {chartMetric === 'value' && (
                        <>
                          <td className="text-right py-2 px-3">{formatCurrency(row.valorVendido)}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(row.valorPerdido)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {periodChartData.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5" style={{ color: '#15AFA1' }} /> Receita ao longo do tempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {periodChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={periodChartData}>
                  <defs>
                    <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#15AFA1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#15AFA1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => formatCompact(v)} tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="valorVendido" name="Receita" stroke="#15AFA1" fill="url(#colorValor)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">Sem dados no período</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <p className="text-3xl md:text-4xl font-bold" style={{ color: conversionRate >= 50 ? '#15AFA1' : '#F59E0B' }}>
                {conversionRate.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">{approved.length} aprovados de {totalQuotes} orçamentos</p>
            </div>
            {paymentData.length > 0 && (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={paymentData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                  <XAxis type="number" tickFormatter={v => formatCompact(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={50} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Receita" fill="#15AFA1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <DollarSign className="h-5 w-5" style={{ color: '#15AFA1' }} /> Receita por Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentData.length > 0 ? (
              <div className="space-y-4">
                {paymentData.map((item, i) => {
                  const maxVal = Math.max(...paymentData.map(d => d.value));
                  const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{item.name}</span>
                        <span>{formatCurrency(item.value)}</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>
    </>); }
}

