import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, subDays, subMonths, startOfDay, endOfDay, differenceInDays, parseISO, eachDayOfInterval, isWithinInterval, eachWeekOfInterval, endOfWeek } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, AreaChart, Area,
} from 'recharts';
import { Users, Trophy, TrendingUp, TrendingDown, Target, Clock, Lightbulb, ArrowUpRight, ArrowDownRight, CalendarDays, Medal, BarChart3, Zap } from 'lucide-react';
import { isPartnershipPayment } from '@/lib/quotePaymentValidation';

const db = supabase as any;

const COLORS = ['#15AFA1', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatCompact = (v: number) => {
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `R$ ${v.toFixed(0)}`;
};

type PeriodPreset = 'today' | '7days' | '30days' | 'this_month' | 'last_month' | 'custom';
type RankingCriteria = 'revenue' | 'conversion' | 'volume' | 'ticket';

interface SellerStats {
  user_id: string;
  name: string;
  total: number;
  approved: number;
  rejected: number;
  inNegotiation: number;
  revenue: number;
  lost: number;
  inNegotiationValue: number;
  conversionRate: number;
  lossRate: number;
  avgTicket: number;
  avgDaysToClose: number;
  proposalsPerDay: number;
  revenuePerDay: number;
}

export default function SellerComparison() {
  const [sellers, setSellers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allQuotes, setAllQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');
  const [customFrom, setCustomFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date | undefined>(new Date());
  const [rankingCriteria, setRankingCriteria] = useState<RankingCriteria>('revenue');

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (periodPreset) {
      case 'today': return { from: startOfDay(now), to: endOfDay(now) };
      case '7days': return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
      case '30days': return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
      case 'this_month': return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'last_month': { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
      case 'custom': return { from: customFrom || startOfMonth(now), to: customTo || now };
      default: return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  }, [periodPreset, customFrom, customTo]);

  const totalDaysInRange = useMemo(() => Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1), [dateRange]);

  useEffect(() => {
    const load = async () => {
      const { data } = await db.from('profiles').select('user_id, full_name, role').eq('commercial_visible', true);
      setSellers(data || []);
    };
    load();
  }, []);

  useEffect(() => {
    if (selectedIds.length === 0) { setAllQuotes([]); return; }
    const load = async () => {
      setLoading(true);
      const { data } = await db.from('quotes')
        .select('id, total, total_amount, status, created_by, quote_date, created_at, payment_method, is_split_payment, split_method_1, split_method_2')
        .gte('quote_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('quote_date', format(dateRange.to, 'yyyy-MM-dd'))
        .in('created_by', selectedIds);
      setAllQuotes(data || []);
      setLoading(false);
    };
    load();
  }, [selectedIds, dateRange]);

  const toggleSeller = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelectedIds(prev => prev.length === sellers.length ? [] : sellers.map(s => s.user_id));
  };

  const stats: SellerStats[] = useMemo(() => {
    return selectedIds.map(id => {
      const seller = sellers.find(s => s.user_id === id);
      const sq = allQuotes.filter(q => q.created_by === id);
      const approved = sq.filter(q => q.status === 'approved' && !isPartnershipPayment(q as any));
      const rejected = sq.filter(q => q.status === 'rejected');
      const inNeg = sq.filter(q => !['approved', 'rejected'].includes(q.status));
      const revenue = approved.reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0);
      const lost = rejected.reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0);
      const inNegVal = inNeg.reduce((s: number, q: any) => s + (q.total_amount || q.total || 0), 0);

      const avgDaysToClose = approved.length > 0
        ? Math.round(approved.reduce((sum: number, q: any) => {
            return sum + Math.max(0, differenceInDays(parseISO(q.quote_date), parseISO(q.created_at)));
          }, 0) / approved.length)
        : 0;

      return {
        user_id: id,
        name: seller?.full_name || 'Desconhecido',
        total: sq.length,
        approved: approved.length,
        rejected: rejected.length,
        inNegotiation: inNeg.length,
        revenue, lost, inNegotiationValue: inNegVal,
        conversionRate: sq.length > 0 ? (approved.length / sq.length) * 100 : 0,
        lossRate: sq.length > 0 ? (rejected.length / sq.length) * 100 : 0,
        avgTicket: approved.length > 0 ? revenue / approved.length : 0,
        avgDaysToClose,
        proposalsPerDay: sq.length / totalDaysInRange,
        revenuePerDay: revenue / totalDaysInRange,
      };
    });
  }, [selectedIds, allQuotes, sellers, totalDaysInRange]);

  const rankedStats = useMemo(() => {
    const sorted = [...stats];
    switch (rankingCriteria) {
      case 'revenue': sorted.sort((a, b) => b.revenue - a.revenue); break;
      case 'conversion': sorted.sort((a, b) => b.conversionRate - a.conversionRate); break;
      case 'volume': sorted.sort((a, b) => b.approved - a.approved); break;
      case 'ticket': sorted.sort((a, b) => b.avgTicket - a.avgTicket); break;
    }
    return sorted;
  }, [stats, rankingCriteria]);

  // KPI winners
  const kpis = useMemo(() => {
    if (stats.length < 2) return null;
    const byRevenue = [...stats].sort((a, b) => b.revenue - a.revenue);
    const byConversion = [...stats].sort((a, b) => b.conversionRate - a.conversionRate);
    const byTicket = [...stats].sort((a, b) => b.avgTicket - a.avgTicket);
    const byLoss = [...stats].sort((a, b) => b.rejected - a.rejected);
    return {
      bestRevenue: byRevenue[0],
      bestConversion: byConversion[0],
      bestTicket: byTicket[0],
      mostLost: byLoss[0],
    };
  }, [stats]);

  // Auto insights
  const insights = useMemo(() => {
    if (stats.length < 2) return [];
    const msgs: string[] = [];
    const byRevenue = [...stats].sort((a, b) => b.revenue - a.revenue);
    const byConversion = [...stats].sort((a, b) => b.conversionRate - a.conversionRate);
    const byTicket = [...stats].sort((a, b) => b.avgTicket - a.avgTicket);
    const byVolume = [...stats].sort((a, b) => b.total - a.total);

    const first = (arr: SellerStats[]) => arr[0]?.name.split(' ')[0];

    if (byRevenue[0] && byRevenue[1]) {
      const diff = byRevenue[0].revenue > 0 && byRevenue[1].revenue > 0
        ? ((byRevenue[0].revenue - byRevenue[1].revenue) / byRevenue[1].revenue * 100).toFixed(0)
        : null;
      if (diff) msgs.push(`${first(byRevenue)} vendeu ${diff}% a mais que ${byRevenue[1].name.split(' ')[0]}.`);
    }

    if (byConversion[0] && byConversion[0].user_id !== byRevenue[0]?.user_id) {
      msgs.push(`${first(byConversion)} tem melhor conversão (${byConversion[0].conversionRate.toFixed(1)}%), mas menor volume de vendas.`);
    }

    if (byVolume[0] && byVolume[0].lossRate > 40) {
      msgs.push(`${first(byVolume)} gera mais propostas, mas perde ${byVolume[0].lossRate.toFixed(0)}% das negociações.`);
    }

    if (byTicket[0]) {
      msgs.push(`${first(byTicket)} tem o maior ticket médio: ${formatCurrency(byTicket[0].avgTicket)}.`);
    }

    const fastest = [...stats].filter(s => s.avgDaysToClose > 0).sort((a, b) => a.avgDaysToClose - b.avgDaysToClose);
    if (fastest.length > 0) {
      msgs.push(`${fastest[0].name.split(' ')[0]} fecha vendas mais rápido: ${fastest[0].avgDaysToClose} dias em média.`);
    }

    return msgs.slice(0, 5);
  }, [stats]);

  // Revenue evolution chart data
  const evolutionData = useMemo(() => {
    if (stats.length === 0) return [];
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const useWeeks = days.length > 30;

    if (useWeeks) {
      try {
        const weeks = eachWeekOfInterval({ start: dateRange.from, end: dateRange.to }, { weekStartsOn: 1 });
        return weeks.map(ws => {
          const we = endOfWeek(ws, { weekStartsOn: 1 });
          const point: any = { label: format(ws, 'dd/MM') };
          stats.forEach(s => {
            const sq = allQuotes.filter(q =>
              q.created_by === s.user_id && q.status === 'approved' &&
              isWithinInterval(parseISO(q.quote_date), { start: ws, end: we })
            );
            point[s.name.split(' ')[0]] = sq.reduce((sum: number, q: any) => sum + (q.total_amount || q.total || 0), 0);
          });
          return point;
        });
      } catch { return []; }
    }

    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const point: any = { label: format(day, 'dd/MM') };
      stats.forEach(s => {
        const sq = allQuotes.filter(q =>
          q.created_by === s.user_id && q.status === 'approved' && q.quote_date === dayStr
        );
        point[s.name.split(' ')[0]] = sq.reduce((sum: number, q: any) => sum + (q.total_amount || q.total || 0), 0);
      });
      return point;
    }).filter(p => {
      return Object.keys(p).some(k => k !== 'label' && p[k] > 0);
    });
  }, [stats, allQuotes, dateRange]);

  // Funnel data
  const funnelData = useMemo(() => {
    return stats.map(s => ({
      name: s.name.split(' ')[0],
      Criadas: s.total,
      'Em Negociação': s.inNegotiation,
      Fechadas: s.approved,
      Perdidas: s.rejected,
    }));
  }, [stats]);

  // Side-by-side comparison (only when exactly 2 selected)
  const sideBySide = useMemo(() => {
    if (rankedStats.length !== 2) return null;
    const [a, b] = rankedStats;
    const diff = (va: number, vb: number) => {
      if (vb === 0) return va > 0 ? '+100%' : '0%';
      const pct = ((va - vb) / vb * 100).toFixed(1);
      return `${Number(pct) >= 0 ? '+' : ''}${pct}%`;
    };
    const metrics = [
      { label: 'Propostas Criadas', a: a.total, b: b.total, diff: diff(a.total, b.total), format: 'number' },
      { label: 'Vendidas', a: a.approved, b: b.approved, diff: diff(a.approved, b.approved), format: 'number' },
      { label: 'Perdidas', a: a.rejected, b: b.rejected, diff: diff(a.rejected, b.rejected), format: 'number', invertColor: true },
      { label: 'Receita', a: a.revenue, b: b.revenue, diff: diff(a.revenue, b.revenue), format: 'currency' },
      { label: 'Ticket Médio', a: a.avgTicket, b: b.avgTicket, diff: diff(a.avgTicket, b.avgTicket), format: 'currency' },
      { label: 'Conversão', a: a.conversionRate, b: b.conversionRate, diff: diff(a.conversionRate, b.conversionRate), format: 'percent' },
      { label: 'Taxa de Perda', a: a.lossRate, b: b.lossRate, diff: diff(a.lossRate, b.lossRate), format: 'percent', invertColor: true },
      { label: 'Tempo Médio Fechamento', a: a.avgDaysToClose, b: b.avgDaysToClose, diff: diff(a.avgDaysToClose, b.avgDaysToClose), format: 'days', invertColor: true },
      { label: 'Propostas/Dia', a: a.proposalsPerDay, b: b.proposalsPerDay, diff: diff(a.proposalsPerDay, b.proposalsPerDay), format: 'decimal' },
      { label: 'Receita/Dia', a: a.revenuePerDay, b: b.revenuePerDay, diff: diff(a.revenuePerDay, b.revenuePerDay), format: 'currency' },
    ];
    return { a, b, metrics };
  }, [rankedStats]);

  const formatMetricVal = (val: number, fmt: string) => {
    switch (fmt) {
      case 'currency': return formatCurrency(val);
      case 'percent': return `${val.toFixed(1)}%`;
      case 'days': return `${val} dias`;
      case 'decimal': return val.toFixed(1);
      default: return String(val);
    }
  };

  const getDiffColor = (diff: string, invert?: boolean) => {
    const val = parseFloat(diff);
    if (isNaN(val) || val === 0) return 'text-muted-foreground';
    const positive = invert ? val < 0 : val > 0;
    return positive ? 'text-emerald-600' : 'text-red-500';
  };

  const getPerformanceColor = (val: number, thresholds: [number, number]) => {
    if (val >= thresholds[1]) return 'text-emerald-600';
    if (val >= thresholds[0]) return 'text-amber-600';
    return 'text-red-500';
  };

  const periodLabels: Record<PeriodPreset, string> = {
    today: 'Hoje',
    '7days': 'Últimos 7 dias',
    '30days': 'Últimos 30 dias',
    this_month: 'Este mês',
    last_month: 'Mês anterior',
    custom: 'Personalizado',
  };

  return (
    <div className="space-y-4">
      {/* Header with period filter */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" /> Comparativo de Vendedores
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Painel avançado de análise de performance</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={periodPreset} onValueChange={v => setPeriodPreset(v as PeriodPreset)}>
                <SelectTrigger className="w-[180px] h-9 text-sm">
                  <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(periodLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {periodPreset === 'custom' && (
                <div className="flex gap-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-9 text-xs", !customFrom && 'text-muted-foreground')}>
                        {customFrom ? format(customFrom, 'dd/MM/yy') : 'De'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-9 text-xs", !customTo && 'text-muted-foreground')}>
                        {customTo ? format(customTo, 'dd/MM/yy') : 'Até'}
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
        </CardHeader>
        <CardContent>
          {/* Seller selection */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Button
              variant={selectedIds.length === sellers.length ? 'default' : 'outline'}
              size="sm" onClick={selectAll} className="h-8 text-xs"
            >
              {selectedIds.length === sellers.length ? 'Desmarcar todos' : 'Todos'}
            </Button>
            <span className="text-xs text-muted-foreground">{selectedIds.length} selecionado(s)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sellers.map((s, i) => (
              <label key={s.user_id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-all ${
                selectedIds.includes(s.user_id)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
              }`}>
                <Checkbox checked={selectedIds.includes(s.user_id)} onCheckedChange={() => toggleSeller(s.user_id)} className="h-3.5 w-3.5" />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {s.full_name}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && selectedIds.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Selecione vendedores para comparar performance
        </CardContent></Card>
      )}

      {!loading && stats.length > 0 && (
        <>
          {/* KPI Cards */}
          {kpis && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Medal className="h-4 w-4 text-amber-500" />
                    <span className="text-[10px] font-semibold text-emerald-700 uppercase">Melhor Receita</span>
                  </div>
                  <p className="text-sm font-bold text-emerald-900">{kpis.bestRevenue.name.split(' ')[0]}</p>
                  <p className="text-xs text-emerald-700">{formatCurrency(kpis.bestRevenue.revenue)}</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-4 w-4 text-blue-500" />
                    <span className="text-[10px] font-semibold text-blue-700 uppercase">Melhor Conversão</span>
                  </div>
                  <p className="text-sm font-bold text-blue-900">{kpis.bestConversion.name.split(' ')[0]}</p>
                  <p className="text-xs text-blue-700">{kpis.bestConversion.conversionRate.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                    <span className="text-[10px] font-semibold text-purple-700 uppercase">Maior Ticket</span>
                  </div>
                  <p className="text-sm font-bold text-purple-900">{kpis.bestTicket.name.split(' ')[0]}</p>
                  <p className="text-xs text-purple-700">{formatCurrency(kpis.bestTicket.avgTicket)}</p>
                </CardContent>
              </Card>
              <Card className="bg-red-50 border-red-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="text-[10px] font-semibold text-red-700 uppercase">Mais Perdas</span>
                  </div>
                  <p className="text-sm font-bold text-red-900">{kpis.mostLost.name.split(' ')[0]}</p>
                  <p className="text-xs text-red-700">{kpis.mostLost.rejected} propostas</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-800 uppercase">Insights Automáticos</span>
                </div>
                <ul className="space-y-1.5">
                  {insights.map((msg, i) => (
                    <li key={i} className="text-xs text-amber-900 flex items-start gap-2">
                      <Zap className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                      {msg}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Side-by-side comparison (2 sellers) */}
          {sideBySide && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Comparação Lado a Lado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Métrica</th>
                        <th className="text-right py-2 px-3 font-medium text-xs" style={{ color: COLORS[selectedIds.indexOf(sideBySide.a.user_id) % COLORS.length] }}>
                          {sideBySide.a.name.split(' ')[0]}
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-xs" style={{ color: COLORS[selectedIds.indexOf(sideBySide.b.user_id) % COLORS.length] }}>
                          {sideBySide.b.name.split(' ')[0]}
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sideBySide.metrics.map((m, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-2 px-3 text-xs font-medium">{m.label}</td>
                          <td className="text-right py-2 px-3 text-xs">{formatMetricVal(m.a, m.format)}</td>
                          <td className="text-right py-2 px-3 text-xs">{formatMetricVal(m.b, m.format)}</td>
                          <td className={cn("text-right py-2 px-3 text-xs font-semibold", getDiffColor(m.diff, m.invertColor))}>
                            {m.diff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ranking Table */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" /> Ranking
                </CardTitle>
                <Select value={rankingCriteria} onValueChange={v => setRankingCriteria(v as RankingCriteria)}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Por Receita</SelectItem>
                    <SelectItem value="conversion">Por Conversão</SelectItem>
                    <SelectItem value="volume">Por Volume</SelectItem>
                    <SelectItem value="ticket">Por Ticket Médio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">#</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Vendedor</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Criadas</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Vendidas</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Perdidas</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Receita</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Ticket</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Conv.</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Perda</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs hidden lg:table-cell">Ciclo</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs hidden lg:table-cell">Prop/Dia</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs hidden lg:table-cell">Rec/Dia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedStats.map((s, i) => (
                      <tr key={s.user_id} className={cn("border-b last:border-0 hover:bg-muted/20", i === 0 && 'bg-amber-50/50')}>
                        <td className="py-2 px-2 text-xs">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                        </td>
                        <td className="py-2 px-2 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[selectedIds.indexOf(s.user_id) % COLORS.length] }} />
                          <span className="font-medium text-xs">{s.name}</span>
                        </td>
                        <td className="text-right py-2 px-2 text-xs">{s.total}</td>
                        <td className="text-right py-2 px-2 text-xs text-emerald-600 font-medium">{s.approved}</td>
                        <td className="text-right py-2 px-2 text-xs text-red-500">{s.rejected}</td>
                        <td className="text-right py-2 px-2 text-xs font-medium">{formatCurrency(s.revenue)}</td>
                        <td className="text-right py-2 px-2 text-xs">{formatCurrency(s.avgTicket)}</td>
                        <td className={cn("text-right py-2 px-2 text-xs font-medium", getPerformanceColor(s.conversionRate, [30, 50]))}>
                          {s.conversionRate.toFixed(1)}%
                        </td>
                        <td className={cn("text-right py-2 px-2 text-xs", getPerformanceColor(100 - s.lossRate, [50, 70]))}>
                          {s.lossRate.toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-2 text-xs hidden lg:table-cell">{s.avgDaysToClose}d</td>
                        <td className="text-right py-2 px-2 text-xs hidden lg:table-cell">{s.proposalsPerDay.toFixed(1)}</td>
                        <td className="text-right py-2 px-2 text-xs hidden lg:table-cell">{formatCurrency(s.revenuePerDay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue Evolution */}
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" style={{ color: '#15AFA1' }} /> Evolução de Receita
                </CardTitle>
              </CardHeader>
              <CardContent>
                {evolutionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={evolutionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                      <YAxis tickFormatter={v => formatCompact(v)} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {stats.map((s, i) => (
                        <Line key={s.user_id} type="monotone" dataKey={s.name.split(' ')[0]}
                          stroke={COLORS[selectedIds.indexOf(s.user_id) % COLORS.length]}
                          strokeWidth={2} dot={{ r: 2 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                )}
              </CardContent>
            </Card>

            {/* Conversion comparison */}
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Conversão vs Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={rankedStats.map(s => ({
                    name: s.name.split(' ')[0],
                    'Conversão (%)': Number(s.conversionRate.toFixed(1)),
                    'Perda (%)': Number(s.lossRate.toFixed(1)),
                  }))} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Conversão (%)" fill="#15AFA1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Perda (%)" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue bar */}
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Receita por Vendedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={rankedStats.map(s => ({
                    name: s.name.split(' ')[0],
                    Vendido: s.revenue,
                    Perdido: s.lost,
                    'Em Negociação': s.inNegotiationValue,
                  }))} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={v => formatCompact(v)} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Vendido" fill="#15AFA1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Perdido" fill="#EF4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Em Negociação" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Funnel */}
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4 text-primary" /> Funil por Vendedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={funnelData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Criadas" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Em Negociação" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Fechadas" fill="#15AFA1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Perdidas" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
