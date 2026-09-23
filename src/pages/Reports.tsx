import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CalendarIcon, Clock, FileDown, BarChart3, Table2 } from 'lucide-react';
import { format, differenceInDays, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
// jsPDF will be imported dynamically to avoid bundle issues

const db = supabase as any;

interface SellerInfo { user_id: string; full_name: string }

type ChartView = 'chart' | 'table';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function Reports() {
  const { user, isGestor, isAdmin } = useAuth();
  const canSeeAll = isAdmin || isGestor;


  const [sellers, setSellers] = useState<SellerInfo[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string>('mine');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });

  // Chart filter states
  const [productsFilter, setProductsFilter] = useState('qty_sold');
  const [productsView, setProductsView] = useState<ChartView>('chart');
  const [valuesFilter, setValuesFilter] = useState('by_period');
  const [valuesView, setValuesView] = useState<ChartView>('chart');
  const [dealsFilter, setDealsFilter] = useState('by_period');
  const [dealsView, setDealsView] = useState<ChartView>('chart');

  useEffect(() => {
    const loadSellers = async () => {
      if (!canSeeAll) return;
      const { data } = await db.from('profiles').select('user_id, full_name').eq('active', true);
      setSellers(data || []);
    };
    loadSellers();
  }, [canSeeAll]);

  useEffect(() => {
    const load = async () => {
      let query = db.from('quotes')
        .select('*, clients(company_name), quote_items(quantity, description, unit_price, line_total)');
      
      if (!canSeeAll || selectedSeller === 'mine') {
        query = query.eq('created_by', user?.id);
      } else if (selectedSeller !== 'all') {
        query = query.eq('created_by', selectedSeller);
      }

      if (dateRange?.from) query = query.gte('created_at', dateRange.from.toISOString());
      if (dateRange?.to) {
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        query = query.lte('created_at', end.toISOString());
      }
      const { data } = await query;
      setQuotes(data || []);
    };
    load();
  }, [dateRange, user?.id, canSeeAll, selectedSeller]);

  const filteredQuotes = useMemo(() => {
    return quotes;
  }, [quotes, selectedSeller, canSeeAll, user?.id]);

  const stats = useMemo(() => {
    const created = filteredQuotes.length;
    const won = filteredQuotes.filter((q: any) => q.status === 'approved');
    const lost = filteredQuotes.filter((q: any) => q.status === 'rejected');
    const negotiation = filteredQuotes.filter((q: any) => q.status === 'negociacao');
    const wonValue = won.reduce((s: number, q: any) => s + (parseFloat(q.total_amount) || 0), 0);
    const lostValue = lost.reduce((s: number, q: any) => s + (parseFloat(q.total_amount) || 0), 0);
    const negotiationValue = negotiation.reduce((s: number, q: any) => s + (parseFloat(q.total_amount) || 0), 0);
    const avgTicket = won.length > 0 ? wonValue / won.length : 0;
    const totalUnits = won.reduce((s: number, q: any) => {
      return s + (q.quote_items || []).reduce((us: number, i: any) => us + (i.quantity || 0), 0);
    }, 0);
    const avgDaysToWin = won.length > 0
      ? won.reduce((s: number, q: any) => {
          const c = new Date(q.created_at);
          const a = q.approved_at ? new Date(q.approved_at) : new Date(q.updated_at);
          return s + Math.max(differenceInDays(a, c), 0);
        }, 0) / won.length
      : 0;
    const avgDaysToLose = lost.length > 0
      ? lost.reduce((s: number, q: any) => {
          const c = new Date(q.created_at);
          const r = q.rejected_at ? new Date(q.rejected_at) : new Date(q.updated_at);
          return s + Math.max(differenceInDays(r, c), 0);
        }, 0) / lost.length
      : 0;
    return { created, won: won.length, lost: lost.length, negotiation: negotiation.length, wonValue, lostValue, negotiationValue, avgTicket, totalUnits, avgDaysToWin: Math.round(avgDaysToWin), avgDaysToLose: Math.round(avgDaysToLose) };
  }, [filteredQuotes]);

  // Products data
  const productsData = useMemo(() => {
    const wonQuotes = filteredQuotes.filter((q: any) => q.status === 'approved');
    const productMap: Record<string, { name: string; qty: number; value: number; seller: string }> = {};

    wonQuotes.forEach((q: any) => {
      const sellerName = sellers.find(s => s.user_id === q.created_by)?.full_name || 'Vendedor';
      (q.quote_items || []).forEach((item: any) => {
        const name = (item.description || 'Sem nome').substring(0, 30);
        if (!productMap[name]) productMap[name] = { name, qty: 0, value: 0, seller: sellerName };
        productMap[name].qty += item.quantity || 0;
        productMap[name].value += parseFloat(item.line_total) || (parseFloat(item.unit_price) || 0) * (item.quantity || 0);
      });
    });

    return Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [filteredQuotes, sellers]);

  // Values by period data
  const valuesData = useMemo(() => {
    const wonQuotes = filteredQuotes.filter((q: any) => q.status === 'approved');
    if (valuesFilter === 'by_period') {
      const dayMap: Record<string, number> = {};
      wonQuotes.forEach((q: any) => {
        const day = format(new Date(q.created_at), 'dd/MM', { locale: ptBR });
        dayMap[day] = (dayMap[day] || 0) + (parseFloat(q.total_amount) || 0);
      });
      return Object.entries(dayMap).map(([date, value]) => ({ date, value }));
    }
    if (valuesFilter === 'by_seller') {
      const sellerMap: Record<string, number> = {};
      wonQuotes.forEach((q: any) => {
        const name = sellers.find(s => s.user_id === q.created_by)?.full_name || 'Vendedor';
        sellerMap[name] = (sellerMap[name] || 0) + (parseFloat(q.total_amount) || 0);
      });
      return Object.entries(sellerMap).map(([name, value]) => ({ date: name, value }));
    }
    if (valuesFilter === 'by_product') {
      const prodMap: Record<string, number> = {};
      wonQuotes.forEach((q: any) => {
        (q.quote_items || []).forEach((item: any) => {
          const name = (item.description || 'Sem nome').substring(0, 25);
          prodMap[name] = (prodMap[name] || 0) + (parseFloat(item.line_total) || 0);
        });
      });
      return Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ date: name, value }));
    }
    return [];
  }, [filteredQuotes, valuesFilter, sellers]);

  // Deals over time data
  const dealsData = useMemo(() => {
    if (dealsFilter === 'by_period') {
      const dayMap: Record<string, { date: string; created: number; won: number; lost: number }> = {};
      filteredQuotes.forEach((q: any) => {
        const day = format(new Date(q.created_at), 'dd/MM', { locale: ptBR });
        if (!dayMap[day]) dayMap[day] = { date: day, created: 0, won: 0, lost: 0 };
        dayMap[day].created++;
        if (q.status === 'approved') dayMap[day].won++;
        if (q.status === 'rejected') dayMap[day].lost++;
      });
      return Object.values(dayMap);
    }
    if (dealsFilter === 'by_seller') {
      const sellerMap: Record<string, { date: string; created: number; won: number; lost: number }> = {};
      filteredQuotes.forEach((q: any) => {
        const name = sellers.find(s => s.user_id === q.created_by)?.full_name || 'Vendedor';
        if (!sellerMap[name]) sellerMap[name] = { date: name, created: 0, won: 0, lost: 0 };
        sellerMap[name].created++;
        if (q.status === 'approved') sellerMap[name].won++;
        if (q.status === 'rejected') sellerMap[name].lost++;
      });
      return Object.values(sellerMap);
    }
    return [];
  }, [filteredQuotes, dealsFilter, sellers]);

  const getSellerName = () => {
    if (selectedSeller === 'mine') return 'Meus';
    if (selectedSeller === 'all') return 'Todos';
    return sellers.find(s => s.user_id === selectedSeller)?.full_name || '';
  };

  const dateLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, 'dd/MM/yyyy')} – ${format(dateRange.to, 'dd/MM/yyyy')}`
    : 'Selecionar período';

  const updatedAt = format(new Date(), "dd/MM/yyyy, HH:mm:ss");

  // PDF Export
  const handleExportPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'a4');
    const w = 190;
    let y = 15;

    doc.setFontSize(16);
    doc.text('Relatório de Negociações', 10, y);
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`${getSellerName()} — ${dateLabel}`, 10, y);
    doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, w - 40, y);
    y += 10;

    doc.setTextColor(0);
    doc.setFontSize(11);

    const addStat = (label: string, value: string) => {
      doc.setFont('helvetica', 'normal');
      doc.text(label + ':', 10, y);
      doc.setFont('helvetica', 'bold');
      doc.text(value, 80, y);
      y += 6;
    };

    addStat('Negociações criadas', String(stats.created));
    addStat('Em Negociação', `${stats.negotiation} — ${formatCurrency(stats.negotiationValue)}`);
    addStat('Negociações vendidas', String(stats.won));
    addStat('Negociações perdidas', String(stats.lost));
    addStat('Valor vendido', formatCurrency(stats.wonValue));
    addStat('Valor perdido', formatCurrency(stats.lostValue));
    addStat('Ticket médio', formatCurrency(stats.avgTicket));
    addStat('Unidades vendidas', String(stats.totalUnits));
    addStat('Tempo médio até venda', `${stats.avgDaysToWin} dias`);
    addStat('Tempo médio até perda', `${stats.avgDaysToLose} dias`);

    y += 6;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Produtos mais vendidos', 10, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    productsData.forEach(p => {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.text(`${p.name} — Qtd: ${p.qty} — ${formatCurrency(p.value)}`, 12, y);
      y += 5;
    });

    y += 6;
    if (y > 250) { doc.addPage(); y = 15; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalhamento', 10, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Nº', 10, y);
    doc.text('Cliente', 35, y);
    doc.text('Status', 100, y);
    doc.text('Valor', 135, y);
    doc.text('Data', 170, y);
    y += 5;
    doc.setFont('helvetica', 'normal');

    filteredQuotes.slice(0, 80).forEach((q: any) => {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(q.quote_number || '', 10, y);
      doc.text((q.clients?.company_name || q.client_name || '—').substring(0, 30), 35, y);
      const st = q.status === 'approved' ? 'Vendido' : q.status === 'rejected' ? 'Perdido' : q.status === 'sent' ? 'Enviado' : 'Rascunho';
      doc.text(st, 100, y);
      doc.text(formatCurrency(parseFloat(q.total_amount) || 0), 130, y);
      doc.text(q.created_at ? format(new Date(q.created_at), 'dd/MM/yyyy') : '—', 170, y);
      y += 4.5;
    });

    doc.save(`relatorio_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!filteredQuotes.length) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    const headers = ['Nº Orçamento', 'Cliente', 'Status', 'Valor', 'Data'];
    const csvContent = [
      headers.join(';'),
      ...filteredQuotes.map(q => [
        q.quote_number || '',
        `"${q.clients?.company_name || q.client_name || ''}"`,
        q.status === 'approved' ? 'Vendido' : q.status === 'rejected' ? 'Perdido' : q.status === 'sent' ? 'Enviado' : 'Rascunho',
        (parseFloat(q.total_amount) || 0).toString().replace('.', ','),
        q.created_at ? format(new Date(q.created_at), 'dd/MM/yyyy') : ''
      ].join(';'))
    ].join('\n');
    
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_negociacoes_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Planilha exportada com sucesso!');
  };

  const ViewToggle = ({ view, setView }: { view: ChartView; setView: (v: ChartView) => void }) => (
    <div className="flex border rounded-md overflow-hidden">
      <button onClick={() => setView('chart')}
        className={`p-1.5 ${view === 'chart' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
        <BarChart3 className="h-4 w-4" />
      </button>
      <button onClick={() => setView('table')}
        className={`p-1.5 ${view === 'table' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
        <Table2 className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <AppLayout>
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">Relatório de Negociações</h1>
          <p className="text-muted-foreground text-sm">Análise de desempenho de vendas</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline" className="gap-2 min-h-[44px]">
            <Table2 className="h-4 w-4" />
            Planilha (CSV)
          </Button>
          <Button onClick={handleExportPdf} variant="outline" className="gap-2 min-h-[44px]">
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {canSeeAll && (
          <Select value={selectedSeller} onValueChange={setSelectedSeller}>
            <SelectTrigger className="min-h-[44px] w-full sm:w-56">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Vendedores</SelectItem>
              <SelectItem value="mine">Meus Resultados</SelectItem>
              {sellers.map(s => (
                <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-h-[44px] w-full sm:w-auto justify-start gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} locale={ptBR} numberOfMonths={2} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <Card className="border-l-4 border-l-emerald-400 bg-emerald-50/60">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-700">Negociações criadas</p>
            <p className="text-2xl font-bold text-emerald-900">{stats.created}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/60">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-700">Negociações vendidas</p>
            <p className="text-2xl font-bold text-emerald-900">{stats.won}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-400 bg-rose-50/60">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-rose-700">Negociações perdidas</p>
            <p className="text-2xl font-bold text-rose-900">{stats.lost}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium text-muted-foreground">Tempo médio até a venda</p>
              <Clock className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.avgDaysToWin} <span className="text-sm font-normal text-muted-foreground">dias</span></p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium text-muted-foreground">Tempo médio até a perda</p>
              <Clock className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.avgDaysToLose} <span className="text-sm font-normal text-muted-foreground">dias</span></p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Card className="border-l-4 border-l-amber-400 bg-amber-50/60">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-amber-700">Em Negociação</p>
            <p className="text-xl font-bold text-amber-900">{stats.negotiation}</p>
            <p className="text-sm font-semibold text-amber-800 mt-1">{formatCurrency(stats.negotiationValue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-sky-50/40">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-sky-700">Valor vendido</p>
            <p className="text-xl font-bold text-sky-900">{formatCurrency(stats.wonValue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-sky-50/40">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-sky-700">Ticket médio</p>
            <p className="text-xl font-bold text-sky-900">{formatCurrency(stats.avgTicket)}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Unidades vendidas</p>
            <p className="text-xl font-bold">{stats.totalUnits}</p>
          </CardContent>
        </Card>
        <Card className="bg-rose-50/40">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-rose-700">Valor perdido</p>
            <p className="text-xl font-bold text-rose-900">{formatCurrency(stats.lostValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart 1: Negociações criadas, vendidas e perdidas */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold font-display">Negociações criadas, vendidas e perdidas</h2>
              <p className="text-xs text-muted-foreground">Atualizado em {updatedAt}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">Mostrar</span>
              <Select value={dealsFilter} onValueChange={setDealsFilter}>
                <SelectTrigger className="w-full sm:w-56 min-h-[40px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="by_period">Quantidade por período</SelectItem>
                  <SelectItem value="by_seller">Quantidade por responsável</SelectItem>
                </SelectContent>
              </Select>
              <ViewToggle view={dealsView} setView={setDealsView} />
            </div>
          </div>

          {dealsData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados no período</p>
          ) : dealsView === 'chart' ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                {dealsFilter === 'by_period' ? (
                  <LineChart data={dealsData} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="created" stroke="hsl(152, 60%, 52%)" strokeWidth={2} name="Criadas" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="won" stroke="hsl(200, 80%, 50%)" strokeWidth={2} name="Vendidas" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="lost" stroke="hsl(350, 70%, 55%)" strokeWidth={2} name="Perdidas" dot={{ r: 3 }} />
                  </LineChart>
                ) : (
                  <BarChart data={dealsData} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="created" fill="hsl(152, 60%, 52%)" name="Criadas" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="won" fill="hsl(200, 80%, 50%)" name="Vendidas" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lost" fill="hsl(350, 70%, 55%)" name="Perdidas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">{dealsFilter === 'by_period' ? 'Data' : 'Responsável'}</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Criadas</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Vendidas</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Perdidas</th>
                  </tr>
                </thead>
                <tbody>
                  {dealsData.map((d, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{d.date}</td>
                      <td className="py-2 text-right">{d.created}</td>
                      <td className="py-2 text-right text-emerald-600 font-medium">{d.won}</td>
                      <td className="py-2 text-right text-rose-600 font-medium">{d.lost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart 2: Products */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold font-display">Produtos e serviços</h2>
              <p className="text-xs text-muted-foreground">Atualizado em {updatedAt}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">Mostrar</span>
              <Select value={productsFilter} onValueChange={setProductsFilter}>
                <SelectTrigger className="w-full sm:w-64 min-h-[40px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qty_sold">Quantidade de produtos vendidos</SelectItem>
                  <SelectItem value="qty_by_seller">Qtd. total por responsável</SelectItem>
                </SelectContent>
              </Select>
              <ViewToggle view={productsView} setView={setProductsView} />
            </div>
          </div>

          {productsData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados no período</p>
          ) : productsView === 'chart' ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productsData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => productsFilter === 'qty_sold' ? v : formatCurrency(v)} />
                  <Bar dataKey="qty" fill="hsl(152, 60%, 52%)" radius={[0, 4, 4, 0]} name="Quantidade" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Produto</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Quantidade</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {productsData.map(p => (
                    <tr key={p.name} className="border-b last:border-0">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2 text-right">{p.qty}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart 3: Values */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold font-display">Valores das negociações</h2>
              <p className="text-xs text-muted-foreground">Atualizado em {updatedAt}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">Mostrar</span>
              <Select value={valuesFilter} onValueChange={setValuesFilter}>
                <SelectTrigger className="w-full sm:w-56 min-h-[40px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="by_period">Valores vendidos por período</SelectItem>
                  <SelectItem value="by_seller">Valores por responsável</SelectItem>
                  <SelectItem value="by_product">Valores por produto</SelectItem>
                </SelectContent>
              </Select>
              <ViewToggle view={valuesView} setView={setValuesView} />
            </div>
          </div>

          {valuesData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados no período</p>
          ) : valuesView === 'chart' ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valuesData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="hsl(152, 60%, 52%)" radius={[4, 4, 0, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">{valuesFilter === 'by_period' ? 'Data' : valuesFilter === 'by_seller' ? 'Responsável' : 'Produto'}</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {valuesData.map((d, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{d.date}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(d.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-lg font-bold font-display mb-4">Detalhamento — {getSellerName()}</h2>
          {filteredQuotes.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma negociação no período</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Nº</th>
                    <th className="pb-2 font-medium text-muted-foreground">Cliente</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Valor</th>
                    <th className="pb-2 font-medium text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.slice(0, 50).map((q: any) => (
                    <tr key={q.id} className="border-b last:border-0">
                      <td className="py-2">{q.quote_number}</td>
                      <td className="py-2">{q.clients?.company_name || q.client_name || '—'}</td>
                      <td className="py-2">
                        <Badge variant={q.status === 'approved' ? 'default' : q.status === 'rejected' ? 'destructive' : 'secondary'}
                          className={q.status === 'approved' ? 'bg-emerald-500 text-white' : ''}>
                          {q.status === 'approved' ? 'Vendido' : q.status === 'rejected' ? 'Perdido' : q.status === 'sent' ? 'Enviado' : 'Rascunho'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right font-medium">{formatCurrency(parseFloat(q.total_amount) || 0)}</td>
                      <td className="py-2 text-muted-foreground">{q.created_at ? format(new Date(q.created_at), 'dd/MM/yyyy') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
