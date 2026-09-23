import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ShieldCheck, XCircle, AlertTriangle, Clock, Coins, Activity, Search } from 'lucide-react';

type Row = {
  id: string; created_at: string; user_id: string; action_type: string; tool_name: string; module: string;
  entity_type: string | null; entity_id: string | null; execution_status: string; confirmation_result: string | null;
  execution_time_ms: number | null; total_tokens: number | null; estimated_cost: number | null;
  prompt: string | null; tool_input: any; tool_output: any; model: string | null; ip: string | null;
};

const statusColor: Record<string, string> = {
  executed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  waiting_confirmation: 'bg-amber-100 text-amber-700 border-amber-200',
};

export default function AssistantAudit() {
  const { isAdmin, isGestor, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [days, setDays] = useState(7);
  const [status, setStatus] = useState<string>('all');
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState<Row | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin && !isGestor) return;
    (async () => {
      setLoadingRows(true);
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase
        .from('assistant_audit_log')
        .select('*')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(500);
      setRows((data as any) || []);
      const userIds: string[] = Array.from(new Set(((data as any) || []).map((r: Row) => r.user_id))) as string[];
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
        const map: Record<string, string> = {};
        for (const p of profs || []) map[p.user_id] = p.full_name;
        setProfiles(map);
      }
      setLoadingRows(false);
    })();
  }, [days, loading, isAdmin, isGestor]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.execution_status !== status) return false;
      if (q && !`${r.action_type} ${r.tool_name} ${r.prompt || ''} ${profiles[r.user_id] || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rows, status, q, profiles]);

  const kpis = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRows = rows.filter((r) => new Date(r.created_at) >= today);
    const executed = todayRows.filter((r) => r.execution_status === 'executed').length;
    const cancelled = todayRows.filter((r) => r.execution_status === 'cancelled').length;
    const failed = todayRows.filter((r) => r.execution_status === 'failed').length;
    const tokens = rows.reduce((s, r) => s + (r.total_tokens || 0), 0);
    const cost = rows.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);
    const avgTime = rows.length ? Math.round(rows.reduce((s, r) => s + (r.execution_time_ms || 0), 0) / rows.length) : 0;
    return { executed, cancelled, failed, tokens, cost, avgTime };
  }, [rows]);

  const toolStats = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.tool_name] = (m[r.tool_name] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const sellerStats = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.user_id] = (m[r.user_id] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  if (loading) return <AppLayout><p className="text-sm text-muted-foreground">Carregando…</p></AppLayout>;
  if (!isAdmin && !isGestor) return <Navigate to="/assistente" replace />;

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">Auditoria do Assistente</h1>
          <p className="text-muted-foreground text-sm">Histórico completo de ações executadas pelo Copiloto Comercial.</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-40 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Últimas 24h</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Executadas hoje', value: kpis.executed, icon: ShieldCheck },
          { label: 'Canceladas hoje', value: kpis.cancelled, icon: XCircle },
          { label: 'Com erro hoje', value: kpis.failed, icon: AlertTriangle },
          { label: 'Tempo médio', value: `${kpis.avgTime} ms`, icon: Clock },
          { label: 'Tokens (período)', value: kpis.tokens.toLocaleString('pt-BR'), icon: Activity },
          { label: 'Custo estimado', value: `US$ ${kpis.cost.toFixed(4)}`, icon: Coins },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{k.label}</p>
                  <p className="mt-1.5 text-lg font-semibold">{k.value}</p>
                </div>
                <k.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Ferramentas mais usadas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {toolStats.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
            {toolStats.map(([name, count]) => (
              <div key={name} className="flex items-center gap-2 text-sm">
                <span className="w-52 truncate font-mono text-xs">{name}</span>
                <div className="flex-1 h-2 bg-muted rounded"><div className="h-2 bg-primary rounded" style={{ width: `${Math.min(100, (count / toolStats[0][1]) * 100)}%` }} /></div>
                <span className="w-10 text-right tabular-nums">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Ações por vendedor</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sellerStats.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
            {sellerStats.map(([uid, count]) => (
              <div key={uid} className="flex items-center gap-2 text-sm">
                <span className="w-52 truncate">{profiles[uid] || uid.slice(0, 8)}</span>
                <div className="flex-1 h-2 bg-muted rounded"><div className="h-2 bg-primary rounded" style={{ width: `${Math.min(100, (count / sellerStats[0][1]) * 100)}%` }} /></div>
                <span className="w-10 text-right tabular-nums">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
          <CardTitle className="text-sm">Registros ({filtered.length})</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 pl-8 w-56" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="executed">Executadas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
                <SelectItem value="failed">Com erro</SelectItem>
                <SelectItem value="waiting_confirmation">Aguardando</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tempo</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRows && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
                {!loadingRows && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Nenhum registro.</TableCell></TableRow>}
                {filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setDrawer(r)}>
                    <TableCell className="text-xs">{format(new Date(r.created_at), 'dd/MM HH:mm', { locale: ptBR })}</TableCell>
                    <TableCell className="text-sm">{profiles[r.user_id] || r.user_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{r.action_type}</TableCell>
                    <TableCell className="text-xs">{r.module}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${statusColor[r.execution_status] || ''}`}>{r.execution_status}</Badge></TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{r.execution_time_ms ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{r.total_tokens ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {drawer && (
            <>
              <SheetHeader><SheetTitle>{drawer.action_type}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Field label="Usuário" value={profiles[drawer.user_id] || drawer.user_id} />
                <Field label="Data" value={format(new Date(drawer.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })} />
                <Field label="Ferramenta" value={drawer.tool_name} />
                <Field label="Status" value={drawer.execution_status} />
                <Field label="Confirmação" value={drawer.confirmation_result || '—'} />
                <Field label="Entidade" value={`${drawer.entity_type || '—'} / ${drawer.entity_id || '—'}`} />
                <Field label="Modelo" value={drawer.model || '—'} />
                <Field label="Tempo" value={`${drawer.execution_time_ms ?? 0} ms`} />
                <Field label="Tokens" value={String(drawer.total_tokens ?? 0)} />
                <Field label="IP" value={drawer.ip || '—'} />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Pergunta</p>
                  <p className="rounded-md border p-2 text-xs">{drawer.prompt || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Input</p>
                  <pre className="rounded-md border p-2 text-[11px] overflow-auto max-h-40">{JSON.stringify(drawer.tool_input, null, 2)}</pre>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Output</p>
                  <pre className="rounded-md border p-2 text-[11px] overflow-auto max-h-40">{JSON.stringify(drawer.tool_output, null, 2)}</pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-muted-foreground min-w-[120px]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
