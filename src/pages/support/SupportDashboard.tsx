import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  Wrench, FileText, Package, Users, DollarSign, TrendingUp, CreditCard, Clock, BarChart3, PieChart as PieIcon, Filter,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area,
} from 'recharts';

const STATUSES = [
  { key: 'recebido', label: 'Recebidos', color: '#94a3b8' },
  { key: 'diagnostico', label: 'Diagnóstico', color: '#3b82f6' },
  { key: 'aguardando_aprovacao', label: 'Aprovação', color: '#f59e0b' },
  { key: 'aguardando_peca', label: 'Aguardando Peça', color: '#f97316' },
  { key: 'em_reparo', label: 'Em Reparo', color: '#ef4444' },
  { key: 'pronto', label: 'Prontos', color: '#10b981' },
  { key: 'entregue', label: 'Entregue', color: '#15803d' },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map(s => [s.key, s.label]));
const STATUS_BADGE: Record<string, string> = {
  recebido: 'bg-slate-100 text-slate-700',
  diagnostico: 'bg-blue-100 text-blue-700',
  aguardando_aprovacao: 'bg-amber-100 text-amber-700',
  aguardando_peca: 'bg-orange-100 text-orange-700',
  em_reparo: 'bg-red-100 text-red-700',
  pronto: 'bg-emerald-100 text-emerald-700',
  entregue: 'bg-green-100 text-green-800',
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR');
};

export default function SupportDashboard() {
  const [orders, setOrders] = useState<any[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [clientsCount, setClientsCount] = useState(0);
  const [budgetsPending, setBudgetsPending] = useState(0);
  const [partsSales, setPartsSales] = useState(0);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    (async () => {
      const [ordersRes, productsRes, clientsRes, budgetsRes] = await Promise.all([
        supabase.from('technical_orders' as any).select('id,os_number,equipment,status,created_at,client_name,total_value,parts_value,labor_value,shipping_value,services_value,os_type,warranty').order('created_at', { ascending: false }),
        supabase.from('technical_products' as any).select('id,quantity'),
        supabase.from('technical_clients' as any).select('id', { count: 'exact', head: true }),
        supabase.from('technical_budgets' as any).select('id', { count: 'exact', head: true }).eq('status', 'pendente' as any),
      ]);
      const ords = (ordersRes.data || []) as any[];
      setOrders(ords);
      setProductsCount(((productsRes.data || []) as any[]).reduce((s, p) => s + Number(p.quantity || 0), 0));
      setClientsCount(clientsRes.count || 0);
      setBudgetsPending(budgetsRes.count || 0);
      setPartsSales(ords.filter(o => o.status === 'entregue').reduce((s, o) => s + Number(o.parts_value || 0), 0));
    })();
  }, []);

  const emManutencao = orders.filter(o => !['entregue', 'pronto'].includes(o.status)).length;

  const statusChart = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return STATUSES.slice(0, 6).map(s => ({ name: s.label, value: counts[s.key] || 0, color: s.color }));
  }, [orders]);

  const recentEntries = orders.slice(0, 6);

  // Faturamento
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!dateFrom && !dateTo) return true;
      const d = new Date(o.created_at);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo]);

  const finished = filteredOrders.filter(o => ['pronto', 'entregue'].includes(o.status));
  const pending = filteredOrders.filter(o => !['pronto', 'entregue'].includes(o.status));
  const faturamentoTotal = finished.reduce((s, o) => s + Number(o.total_value || 0), 0);
  const faturamentoPendente = pending.reduce((s, o) => s + Number(o.total_value || 0), 0);
  const ticketMedio = finished.length ? faturamentoTotal / finished.length : 0;
  const emGarantia = filteredOrders.filter(o => o.os_type === 'Garantia' || o.warranty).reduce((s, o) => s + Number(o.total_value || 0), 0);
  const emPecas = filteredOrders.reduce((s, o) => s + Number(o.parts_value || 0), 0);
  const emMaoObra = filteredOrders.reduce((s, o) => s + Number(o.labor_value || 0), 0);
  const emFrete = filteredOrders.reduce((s, o) => s + Number(o.shipping_value || 0), 0);

  const monthlyRevenue = useMemo(() => {
    const map: Record<string, { finished: number; pending: number }> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map[key] = { finished: 0, pending: 0 };
    }
    filteredOrders.forEach(o => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) return;
      const v = Number(o.total_value || 0);
      if (['pronto', 'entregue'].includes(o.status)) map[key].finished += v;
      else map[key].pending += v;
    });
    return Object.entries(map).map(([k, v]) => {
      const [y, m] = k.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      return { mes: label, Finalizado: v.finished, Pendente: v.pending };
    });
  }, [filteredOrders]);

  const kpisGeral = [
    { title: 'Em Manutenção', value: emManutencao, icon: Wrench, bg: 'bg-blue-100', color: 'text-blue-600' },
    { title: 'Orçamentos Pendentes', value: budgetsPending, icon: Clock, bg: 'bg-amber-100', color: 'text-amber-600' },
    { title: 'Vendas de Peças', value: fmtBRL(partsSales), icon: DollarSign, bg: 'bg-purple-100', color: 'text-purple-600' },
    { title: 'Clientes Ativos', value: clientsCount, icon: Users, bg: 'bg-emerald-100', color: 'text-emerald-600' },
    { title: 'Peças Totais', value: productsCount, icon: Package, bg: 'bg-slate-200', color: 'text-slate-700' },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da assistência</p>
      </div>

      <Tabs defaultValue="geral" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="geral" className="gap-2"><BarChart3 className="h-4 w-4" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="faturamento" className="gap-2"><DollarSign className="h-4 w-4" /> Faturamento</TabsTrigger>
        </TabsList>

        {/* ============ VISÃO GERAL ============ */}
        <TabsContent value="geral" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {kpisGeral.map((k) => (
              <Card key={k.title} className="shadow-sm">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{k.title}</p>
                    <p className="text-2xl font-bold text-foreground">{k.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${k.bg}`}>
                    <k.icon className={`h-5 w-5 ${k.color}`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-bold">Status dos Serviços</CardTitle>
                <div className="flex items-center gap-1 border rounded-md p-0.5">
                  <button onClick={() => setChartType('bar')} className={`p-1.5 rounded ${chartType === 'bar' ? 'bg-muted' : ''}`}>
                    <BarChart3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setChartType('pie')} className={`p-1.5 rounded ${chartType === 'pie' ? 'bg-muted' : ''}`}>
                    <PieIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === 'bar' ? (
                      <BarChart data={statusChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {statusChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Bar>
                      </BarChart>
                    ) : (
                      <PieChart>
                        <Pie data={statusChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                          {statusChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-bold">Entradas Recentes</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {recentEntries.map((o) => (
                  <div key={o.id} className="flex items-start justify-between gap-2 pb-3 border-b last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{o.equipment || o.client_name}</p>
                      <p className="text-[11px] text-muted-foreground">{o.os_number} • {fmtDate(o.created_at)}</p>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] font-medium border-0 ${STATUS_BADGE[o.status] || ''}`}>
                      {STATUS_LABEL[o.status] || o.status}
                    </Badge>
                  </div>
                ))}
                {recentEntries.length === 0 && <p className="text-xs text-muted-foreground italic">Sem registros</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ FATURAMENTO ============ */}
        <TabsContent value="faturamento" className="space-y-6">
          <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" /> Filtrar por data:
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <label className="text-xs text-muted-foreground">De:</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-auto" />
                <label className="text-xs text-muted-foreground">Até:</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-auto" />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Faturamento Total</p>
                  <p className="text-2xl font-bold">{fmtBRL(faturamentoTotal)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Ordens finalizadas ou entregues</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-500"><DollarSign className="h-5 w-5 text-white" /></div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Faturamento Pendente</p>
                  <p className="text-2xl font-bold">{fmtBRL(faturamentoPendente)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Ordens em andamento</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-500"><TrendingUp className="h-5 w-5 text-white" /></div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ticket Médio</p>
                  <p className="text-2xl font-bold">{fmtBRL(ticketMedio)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-500"><CreditCard className="h-5 w-5 text-white" /></div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Em Garantia', value: emGarantia },
              { label: 'Em Peças', value: emPecas },
              { label: 'Em Mão de Obra', value: emMaoObra },
              { label: 'Em Frete', value: emFrete },
            ].map((k) => (
              <Card key={k.label} className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                  <p className="text-lg font-bold">{fmtBRL(k.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-bold">Receita Mensal</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyRevenue}>
                    <defs>
                      <linearGradient id="gFin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gPend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                    <Area type="monotone" dataKey="Finalizado" stroke="#3b82f6" fill="url(#gFin)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Pendente" stroke="#10b981" fill="url(#gPend)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
