import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Users, FileText, Building2, UserCircle, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  recebido: '#94a3b8',
  diagnostico: '#3b82f6',
  aguardando_aprovacao: '#f59e0b',
  aguardando_peca: '#f97316',
  em_reparo: '#ef4444',
  pronto: '#10b981',
  entregue: '#15803d',
  cancelado: '#64748b',
};
const STATUS_LABEL: Record<string, string> = {
  recebido: 'Recebido',
  diagnostico: 'Diagnóstico',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aguardando_peca: 'Aguardando Peça',
  em_reparo: 'Em Reparo',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
const CATEGORY_COLORS: Record<string, string> = {
  Garantia: '#ec4899',
  'Orçamento': '#8b5cf6',
  Cortesia: '#ef4444',
  Corretiva: '#3b82f6',
};

export default function SupportReports() {
  const [orders, setOrders] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [clientsCount, setClientsCount] = useState(0);
  const [tech, setTech] = useState('all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: p }, { count: cc }] = await Promise.all([
        supabase.from('technical_orders' as any).select('id,os_number,status,os_type,equipment,reported_defect,technician_name,total_value,created_at').order('created_at', { ascending: false }),
        supabase.from('technical_order_parts' as any).select('product_name,quantity'),
        supabase.from('technical_clients' as any).select('id', { count: 'exact', head: true }),
      ]);
      setOrders((o || []) as any[]);
      setParts((p || []) as any[]);
      setClientsCount(cc || 0);
    })();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (tech !== 'all' && o.technician_name !== tech) return false;
      const d = new Date(o.created_at);
      if (start && d < new Date(start)) return false;
      if (end && d > new Date(end + 'T23:59:59')) return false;
      return true;
    });
  }, [orders, tech, start, end]);

  const technicians = useMemo(() => Array.from(new Set(orders.map(o => o.technician_name).filter(Boolean))), [orders]);

  const techProductivity = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => { if (o.technician_name) map[o.technician_name] = (map[o.technician_name] || 0) + 1; });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filteredOrders]);

  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => { map[o.status] = (map[o.status] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: STATUS_LABEL[k] || k, value: v, color: STATUS_COLORS[k] || '#94a3b8' }));
  }, [filteredOrders]);

  const recurrentFailures = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const k = (o.reported_defect || '').trim().slice(0, 50);
      if (k) map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filteredOrders]);

  const mostMaintained = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const k = (o.equipment || '').trim();
      if (k) map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filteredOrders]);

  const mostUsedProducts = useMemo(() => {
    const map: Record<string, number> = {};
    parts.forEach(p => { map[p.product_name] = (map[p.product_name] || 0) + (Number(p.quantity) || 0); });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [parts]);

  const osByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => { const k = o.os_type || 'Corretiva'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: CATEGORY_COLORS[name] || '#6366f1' }));
  }, [filteredOrders]);

  const clearFilters = () => { setTech('all'); setStart(''); setEnd(''); };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Relatórios Técnicos</h1>
        <p className="text-sm text-muted-foreground">Visão geral e performance da assistência</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="tech">Técnico</Label>
              <Select value={tech} onValueChange={setTech}>
                <SelectTrigger id="tech"><SelectValue placeholder="Todos os técnicos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os técnicos</SelectItem>
                  {technicians.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Início</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div className="space-y-2"><Label>Final</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
            <div className="md:col-span-2 flex gap-2">
              <Button variant="outline" className="gap-2" onClick={clearFilters}><X className="h-4 w-4" />Limpar</Button>
              <div className="flex-1 flex items-center text-xs text-muted-foreground gap-1"><Filter className="h-3 w-3" />{filteredOrders.length} OS no recorte</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6 text-center flex flex-col items-center">
          <div className="p-3 bg-blue-50 rounded-full mb-3"><Users className="h-6 w-6 text-blue-600" /></div>
          <span className="text-3xl font-bold">{technicians.length}</span>
          <span className="text-xs uppercase text-muted-foreground mt-1">Técnicos Ativos</span>
        </Card>
        <Card className="p-6 text-center flex flex-col items-center">
          <div className="p-3 bg-blue-50 rounded-full mb-3"><FileText className="h-6 w-6 text-blue-600" /></div>
          <span className="text-3xl font-bold">{filteredOrders.length}</span>
          <span className="text-xs uppercase text-muted-foreground mt-1">Ordens de Serviço</span>
        </Card>
        <Card className="p-6 text-center flex flex-col items-center">
          <div className="p-3 bg-blue-50 rounded-full mb-3"><Building2 className="h-6 w-6 text-blue-600" /></div>
          <span className="text-3xl font-bold">{filteredOrders.filter(o => ['pronto','entregue'].includes(o.status)).length}</span>
          <span className="text-xs uppercase text-muted-foreground mt-1">Finalizadas</span>
        </Card>
        <Card className="p-6 text-center flex flex-col items-center">
          <div className="p-3 bg-blue-50 rounded-full mb-3"><UserCircle className="h-6 w-6 text-blue-600" /></div>
          <span className="text-3xl font-bold">{clientsCount}</span>
          <span className="text-xs uppercase text-muted-foreground mt-1">Clientes</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">Status das OS</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {statusData.length === 0 ? <p className="text-sm text-muted-foreground text-center pt-20">Sem dados</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">Falhas Recorrentes</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {recurrentFailures.length === 0 ? <p className="text-sm text-muted-foreground text-center pt-20">Nenhum defeito registrado</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recurrentFailures} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f0f0f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={180} axisLine={false} tickLine={false} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">Equipamentos Mais Manutenidos</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {mostMaintained.length === 0 ? <p className="text-sm text-muted-foreground text-center pt-20">Sem dados</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mostMaintained}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">Produtos Mais Utilizados</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {mostUsedProducts.length === 0 ? <p className="text-sm text-muted-foreground text-center pt-20">Nenhuma peça utilizada</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mostUsedProducts} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f0f0f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">OS por Categoria</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {osByCategory.length === 0 ? <p className="text-sm text-muted-foreground text-center pt-20">Sem dados</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={osByCategory} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value" label>
                    {osByCategory.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">Produtividade por Técnico</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {techProductivity.length === 0 ? <p className="text-sm text-muted-foreground text-center pt-20">Sem técnicos atribuídos</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={techProductivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" fontSize={10} angle={-15} textAnchor="end" height={50} interval={0} />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
