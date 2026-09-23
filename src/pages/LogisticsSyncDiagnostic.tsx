import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Play, AlertTriangle, CheckCircle2, XCircle, Package, Link2, Sparkles, Search, Download, Truck as TruckIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const PROVIDER = 'loja_integrada';

type Product = {
  id: string; name: string; code: string | null; sku: string | null;
  peso_kg: number | null; altura_cm: number | null; largura_cm: number | null; comprimento_cm: number | null;
  logistica_atualizada_em: string | null; bloquear_atualizacao_logistica: boolean | null;
  loja_integrada_sync_source: string | null;
};

type ExtLink = { product_id: string; sync_status: string; match_source: string | null; last_sync_at: string | null };
type ExecLog = { id: string; action: string; targets_count: number; linked_count: number; updated_count: number; needs_validation_count: number; not_found_count: number; errors_count: number; duration_ms: number; created_at: string; triggered_by_name: string | null };

type LogEntry = { ts: string; level: 'info' | 'ok' | 'warn' | 'err'; msg: string };
type SmartReport = {
  total: number; linked: number; updated: number; needs_review: number; not_found: number; errors: number; li_catalog_size: number;
  not_found_details?: any[]; needs_review_details?: any[];
} | null;

const BATCH = 25;

export default function LogisticsSyncDiagnostic() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [links, setLinks] = useState<Record<string, ExtLink>>({});
  const [execLogs, setExecLogs] = useState<ExecLog[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [smartReport, setSmartReport] = useState<SmartReport>(null);
  const [smartRunning, setSmartRunning] = useState(false);
  const [reprocessRunning, setReprocessRunning] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditRows, setAuditRows] = useState<any[] | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditFilter, setAuditFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const [p, l, e] = await Promise.all([
      supabase.from('products').select('id,name,code,sku,peso_kg,altura_cm,largura_cm,comprimento_cm,logistica_atualizada_em,bloquear_atualizacao_logistica,loja_integrada_sync_source').order('name'),
      supabase.from('product_external_links').select('product_id,sync_status,match_source,last_sync_at').eq('provider', PROVIDER),
      supabase.from('sync_execution_logs').select('*').eq('provider', PROVIDER).order('created_at', { ascending: false }).limit(10),
    ]);
    if (p.error) toast.error(p.error.message);
    setProducts((p.data as any) || []);
    const map: Record<string, ExtLink> = {};
    for (const row of (l.data as any[]) || []) map[row.product_id] = row;
    setLinks(map);
    setExecLogs((e.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const total = products.length;
    let linked = 0, needs = 0, notFound = 0, syncedToday = 0, withPeso = 0, withDims = 0, conflicts = 0;
    let prontos = 0, vinculadoSemPeso = 0, vinculadoSemDims = 0, vinculadoCompleto = 0;
    let srcApi = 0, srcPlanilha = 0, srcManual = 0, srcNenhum = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const p of products) {
      const l = links[p.id];
      const isLinked = l?.sync_status === 'linked';
      if (isLinked) linked++;
      if (l?.sync_status === 'needs_validation') needs++;
      if (l?.sync_status === 'not_found') notFound++;
      if (l?.sync_status === 'error') conflicts++;
      if (l?.last_sync_at && l.last_sync_at.slice(0, 10) === today) syncedToday++;
      const hasPeso = !!(p.peso_kg && p.peso_kg > 0);
      const hasDims = !!(p.altura_cm && p.largura_cm && p.comprimento_cm);
      if (hasPeso) withPeso++;
      if (hasDims) withDims++;
      if (hasPeso && hasDims) prontos++;
      if (isLinked) {
        if (hasPeso && hasDims) vinculadoCompleto++;
        else {
          if (!hasPeso) vinculadoSemPeso++;
          if (!hasDims) vinculadoSemDims++;
        }
      }
      const src = p.loja_integrada_sync_source;
      const hasData = hasPeso || (p.altura_cm && p.altura_cm > 0);
      if (!hasData) srcNenhum++;
      else if (src === 'loja_integrada') srcApi++;
      else if (src === 'planilha_loja_integrada') srcPlanilha++;
      else if (src === 'manual') srcManual++;
      else srcApi++;
    }
    return {
      total, linked, unlinked: total - linked, needs, notFound, conflicts, syncedToday,
      semPeso: total - withPeso, semDims: total - withDims,
      prontos, vinculadoSemPeso, vinculadoSemDims, vinculadoCompleto,
      srcApi, srcPlanilha, srcManual, srcNenhum,
    };
  }, [products, links]);

  const pushLog = (level: LogEntry['level'], msg: string) =>
    setLogs(prev => [...prev, { ts: new Date().toLocaleTimeString(), level, msg }].slice(-500));

  const runSync = async (mode: 'all' | 'unlinked') => {
    setRunning(true); setLogs([]); setProgress(0); setProcessed(0);
    const target = products.filter(p => {
      if (p.bloquear_atualizacao_logistica) return false;
      if (mode === 'all') return true;
      const l = links[p.id];
      return !l || l.sync_status !== 'linked';
    });
    pushLog('info', `Iniciando sincronização de ${target.length} produtos (modo: ${mode}).`);

    let totalUpdated = 0, totalLinked = 0, totalNotFound = 0, totalReview = 0, totalErrors = 0;

    for (let i = 0; i < target.length; i += BATCH) {
      const slice = target.slice(i, i + BATCH);
      const ids = slice.map(p => p.id);
      pushLog('info', `Lote ${Math.floor(i / BATCH) + 1}: ${ids.length} produtos...`);
      try {
        const { data, error } = await supabase.functions.invoke('loja-integrada', {
          body: { action: 'sync_product_dimensions', product_ids: ids },
        });
        if (error) { pushLog('err', `Erro no lote: ${error.message}`); totalErrors += ids.length; }
        else if (!data?.ok) { pushLog('err', `Falha: ${data?.error}`); totalErrors += ids.length; }
        else {
          totalUpdated += data.updated || 0;
          totalLinked += data.linked || 0;
          totalNotFound += data.not_found || 0;
          totalReview += data.needs_review || 0;
          totalErrors += data.errors || 0;
          pushLog('ok', `Lote OK — vinculados: ${data.linked}, atualizados: ${data.updated}, validar: ${data.needs_review}, sem match: ${data.not_found}, erros: ${data.errors}`);
        }
      } catch (e: any) { pushLog('err', `Exceção: ${e.message}`); totalErrors += ids.length; }
      setProcessed(i + slice.length);
      setProgress(Math.round(((i + slice.length) / target.length) * 100));
    }

    pushLog('ok', `Concluído. Vinculados: ${totalLinked}, Dimensões atualizadas: ${totalUpdated}, Aguardando validação: ${totalReview}, Sem match: ${totalNotFound}, Erros: ${totalErrors}`);
    toast.success(`Sincronização finalizada: ${totalLinked} vinculados`);
    setRunning(false);
    await load();
  };

  const runSmartSync = async () => {
    setSmartRunning(true); setSmartReport(null); setLogs([]); setProgress(0); setProcessed(0);
    toast.info('Iniciando Sincronização Inteligente…');
    try {
      const targets = products.filter(p => !p.bloquear_atualizacao_logistica);
      const CHUNK = 100;
      const agg = { total: 0, linked: 0, updated: 0, needs_review: 0, not_found: 0, errors: 0, li_catalog_size: 0 };
      pushLog('info', `Processando ${targets.length} produtos em lotes de ${CHUNK}…`);
      for (let i = 0; i < targets.length; i += CHUNK) {
        const slice = targets.slice(i, i + CHUNK).map(p => p.id);
        const { data, error } = await supabase.functions.invoke('loja-integrada', {
          body: { action: 'sync_product_dimensions', product_ids: slice },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Falha na sincronização inteligente');
        agg.total += data.total || 0;
        agg.linked += data.linked || 0;
        agg.updated += data.updated || 0;
        agg.needs_review += data.needs_review || 0;
        agg.not_found += data.not_found || 0;
        agg.errors += data.errors || 0;
        agg.li_catalog_size = data.li_catalog_size || agg.li_catalog_size;
        setProcessed(Math.min(i + CHUNK, targets.length));
        setProgress(Math.round(Math.min(i + CHUNK, targets.length) / Math.max(targets.length, 1) * 100));
        pushLog('ok', `Lote ${Math.floor(i / CHUNK) + 1}: vinculados ${data.linked}, dims ${data.updated}, revisar ${data.needs_review}, sem match ${data.not_found}`);
      }
      setSmartReport(agg as SmartReport);
      const pct = agg.total ? Math.round((agg.linked / agg.total) * 100) : 0;
      toast.success(`Sincronização Inteligente concluída: ${agg.linked}/${agg.total} vinculados (${pct}%).`);
      await load();
    } catch (e: any) {
      toast.error('Falha: ' + e.message);
    } finally {
      setSmartRunning(false);
    }
  };

  const runReprocessMissing = async () => {
    setReprocessRunning(true);
    toast.info('Reprocessando produtos sem peso/dimensões…');
    try {
      const { data, error } = await supabase.functions.invoke('loja-integrada', {
        body: { action: 'reprocess_missing_only' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao reprocessar');
      toast.success(`Reprocessamento concluído: ${data.updated || 0} atualizados, ${data.linked || 0} vinculados de ${data.total || 0}.`);
      await load();
    } catch (e: any) {
      toast.error('Falha: ' + e.message);
    } finally { setReprocessRunning(false); }
  };

  const runAudit = async () => {
    setAuditRunning(true); setAuditRows(null);
    toast.info('Auditando produtos sem peso/dimensões (consulta API Loja Integrada por produto)…');
    try {
      const { data, error } = await supabase.functions.invoke('loja-integrada', {
        body: { action: 'audit_missing_dimensions' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha na auditoria');
      setAuditRows(data.rows || []);
      setAuditOpen(true);
      toast.success(`Auditoria concluída: ${data.total} produto(s) analisados.`);
    } catch (e: any) {
      toast.error('Falha: ' + e.message);
    } finally { setAuditRunning(false); }
  };

  const exportPendenciasCSV = () => {
    const source = auditRows && auditRows.length ? auditRows : products
      .filter(p => !p.peso_kg || !p.altura_cm || !p.largura_cm || !p.comprimento_cm)
      .map(p => {
        const l = links[p.id];
        return {
          product_id: p.id, product_name: p.name, crm_code: p.code, crm_sku: p.sku,
          li_id: l?.match_source ? '' : '', li_sku: '', li_name: '',
          variacao_id: '', peso: p.peso_kg, altura: p.altura_cm, largura: p.largura_cm, profundidade: p.comprimento_cm,
          fonte: p.loja_integrada_sync_source || '',
          motivo: l?.sync_status || 'sem_vinculo',
          sync_status: l?.sync_status || 'unlinked',
        };
      });
    if (!source.length) { toast.info('Nada a exportar.'); return; }
    const headers = ['product_name','crm_code','crm_sku','li_id','li_sku','li_name','variacao_id','peso','altura','largura','profundidade','fonte','motivo','sync_status'];
    const escape = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(';'), ...source.map((r: any) => headers.map(h => escape(r[h])).join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pendencias-logistica-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`CSV exportado (${source.length} linhas).`);
  };

  const filteredAudit = useMemo(() => {
    if (!auditRows) return [];
    const q = auditFilter.trim().toLowerCase();
    if (!q) return auditRows;
    return auditRows.filter(r =>
      (r.product_name || '').toLowerCase().includes(q) ||
      (r.crm_code || '').toLowerCase().includes(q) ||
      (r.crm_sku || '').toLowerCase().includes(q) ||
      (r.motivo || '').toLowerCase().includes(q)
    );
  }, [auditRows, auditFilter]);




  const StatCard = ({ label, value, tone, icon: Icon }: any) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${tone || ''}`}>{value}</p>
          </div>
          {Icon && <Icon className="h-8 w-8 text-muted-foreground opacity-40" />}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Diagnóstico da Sincronização Logística</h1>
            <p className="text-sm text-muted-foreground">Baseado em <code className="text-xs">product_external_links</code> (provider: Loja Integrada).</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/mapeamento-produtos"><Button variant="outline"><Link2 className="h-4 w-4 mr-2" />Mapeamento</Button></Link>
            <Button variant="outline" onClick={load} disabled={loading || running || smartRunning}><RefreshCw className="h-4 w-4 mr-2" />Recarregar</Button>
            <Button variant="outline" onClick={exportPendenciasCSV}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
            <Button variant="outline" onClick={runAudit} disabled={auditRunning || smartRunning || running}>
              {auditRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Auditar pendências
            </Button>
            <Button variant="secondary" onClick={runReprocessMissing} disabled={reprocessRunning || smartRunning || running}>
              {reprocessRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Reprocessar sem peso/dimensões
            </Button>
            <Button onClick={() => runSync('unlinked')} disabled={running || loading || smartRunning} variant="secondary">
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Sincronizar sem vínculo
            </Button>
            <Button
              onClick={runSmartSync}
              disabled={smartRunning || running || loading}
              className="bg-gradient-to-r from-primary to-purple-600 hover:opacity-90"
            >
              {smartRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Sincronização Inteligente
            </Button>
          </div>
        </div>

        {(smartRunning || smartReport) && (
          <Card className="border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Relatório da Sincronização Inteligente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {smartRunning && !smartReport && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando catálogo da Loja Integrada, aplicando matching (SKU → Código → MPN → Nome → Fuzzy) e atualizando peso/dimensões…
                </div>
              )}
              {smartReport && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                      <p className="text-xs text-muted-foreground">✔ Vinculados automaticamente</p>
                      <p className="text-2xl font-bold text-emerald-600">{smartReport.linked}</p>
                      <p className="text-xs text-muted-foreground">{smartReport.updated} com dimensões atualizadas</p>
                    </div>
                    <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3">
                      <p className="text-xs text-muted-foreground">⚠ Precisam de revisão</p>
                      <p className="text-2xl font-bold text-amber-600">{smartReport.needs_review}</p>
                      <Link to="/mapeamento-produtos" className="text-xs text-primary hover:underline">Revisar candidatos →</Link>
                    </div>
                    <div className="rounded-md border border-slate-500/30 bg-slate-50 dark:bg-slate-950/20 p-3">
                      <p className="text-xs text-muted-foreground">❌ Sem correspondência</p>
                      <p className="text-2xl font-bold text-slate-600">{smartReport.not_found}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Total processado</p>
                      <p className="text-2xl font-bold">{smartReport.total}</p>
                      <p className="text-xs text-muted-foreground">Catálogo LI: {smartReport.li_catalog_size}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Taxa de vinculação automática:{' '}
                    <span className="font-semibold text-foreground">
                      {smartReport.total ? Math.round((smartReport.linked / smartReport.total) * 100) : 0}%
                    </span>
                    {smartReport.errors > 0 && <> · <span className="text-red-600">{smartReport.errors} erros</span></>}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
          <StatCard label="Total de produtos" value={stats.total} icon={Package} />
          <StatCard label="Prontos para cálculo de frete" value={stats.prontos} tone="text-emerald-600" icon={TruckIcon} />
          <StatCard label="Vinculados completos" value={stats.vinculadoCompleto} tone="text-emerald-600" icon={CheckCircle2} />
          <StatCard label="Vinculados sem peso" value={stats.vinculadoSemPeso} tone="text-amber-600" icon={AlertTriangle} />
          <StatCard label="Vinculados sem dimensões" value={stats.vinculadoSemDims} tone="text-amber-600" icon={AlertTriangle} />
          <StatCard label="Sem vínculo" value={stats.unlinked} tone="text-amber-600" />
          <StatCard label="Aguardando validação" value={stats.needs} tone="text-red-600" />
          <StatCard label="Sem correspondência" value={stats.notFound} tone="text-slate-600" />
          <StatCard label="Erros de API" value={stats.conflicts} tone="text-red-600" icon={XCircle} />
          <StatCard label="Sincronizados hoje" value={stats.syncedToday} tone="text-emerald-600" />
          <StatCard label="Sem peso" value={stats.semPeso} tone="text-red-600" />
          <StatCard label="Sem dimensões" value={stats.semDims} tone="text-red-600" />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fonte dos dados logísticos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">API Loja Integrada</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.srcApi}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Planilha</p>
                <p className="text-2xl font-bold text-blue-600">{stats.srcPlanilha}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Manual</p>
                <p className="text-2xl font-bold text-slate-600">{stats.srcManual}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Sem dados</p>
                <p className="text-2xl font-bold text-red-600">{stats.srcNenhum}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {running && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Progresso</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">{processed} de {products.length} processados ({progress}%)</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Log da execução em andamento</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72 overflow-auto bg-slate-950 text-slate-100 rounded-md p-3 font-mono text-xs space-y-1">
                {logs.length === 0 && <p className="text-slate-500">Aguardando execução...</p>}
                {logs.map((l, i) => (
                  <div key={i} className={
                    l.level === 'err' ? 'text-red-400' :
                    l.level === 'warn' ? 'text-amber-300' :
                    l.level === 'ok' ? 'text-emerald-400' : 'text-slate-300'
                  }>[{l.ts}] {l.msg}</div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Histórico de execuções (últimas 10)</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-auto space-y-2">
                {execLogs.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma execução registrada ainda.</p>}
                {execLogs.map(e => (
                  <div key={e.id} className="border rounded-md p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{e.action}</span>
                      <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex gap-1 flex-wrap mt-1">
                      <Badge variant="outline">Alvos: {e.targets_count}</Badge>
                      <Badge className="bg-emerald-600">Vinculados: {e.linked_count}</Badge>
                      <Badge variant="secondary">Dims: {e.updated_count}</Badge>
                      <Badge variant="destructive">Validar: {e.needs_validation_count}</Badge>
                      <Badge variant="outline">Sem match: {e.not_found_count}</Badge>
                      <Badge variant="destructive">Erros: {e.errors_count}</Badge>
                      <Badge variant="outline">{e.duration_ms}ms</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
          <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Auditoria de pendências ({auditRows?.length || 0} produtos analisados)
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Filtrar por nome, código, SKU ou motivo…"
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={exportPendenciasCSV}>
                <Download className="h-4 w-4 mr-2" />CSV
              </Button>
            </div>
            <div className="flex-1 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Produto CRM</th>
                    <th className="p-2">Cód/SKU</th>
                    <th className="p-2">LI ID</th>
                    <th className="p-2">LI SKU/Nome</th>
                    <th className="p-2">Variação</th>
                    <th className="p-2">Peso</th>
                    <th className="p-2">Alt</th>
                    <th className="p-2">Larg</th>
                    <th className="p-2">Prof</th>
                    <th className="p-2">Fonte</th>
                    <th className="p-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((r: any) => (
                    <tr key={r.product_id} className="border-t hover:bg-muted/50">
                      <td className="p-2 max-w-[200px] truncate" title={r.product_name}>{r.product_name}</td>
                      <td className="p-2 text-muted-foreground">{r.crm_code || r.crm_sku || '—'}</td>
                      <td className="p-2">{r.li_id || '—'}</td>
                      <td className="p-2 max-w-[180px] truncate" title={r.li_name}>{r.li_sku || r.li_name || '—'}</td>
                      <td className="p-2">{r.variacao_id || '—'}</td>
                      <td className={`p-2 tabular-nums ${!r.peso ? 'text-red-600' : ''}`}>{r.peso ?? '—'}</td>
                      <td className={`p-2 tabular-nums ${!r.altura ? 'text-red-600' : ''}`}>{r.altura ?? '—'}</td>
                      <td className={`p-2 tabular-nums ${!r.largura ? 'text-red-600' : ''}`}>{r.largura ?? '—'}</td>
                      <td className={`p-2 tabular-nums ${!r.profundidade ? 'text-red-600' : ''}`}>{r.profundidade ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">{r.fonte || '—'}</td>
                      <td className="p-2">
                        <Badge variant={
                          r.motivo === 'campo_ausente' || r.motivo === 'valor_zero' || r.motivo === 'valor_parcial' ? 'destructive' :
                          r.motivo === 'sem_vinculo' || r.motivo === 'sem_correspondencia' ? 'outline' :
                          r.motivo === 'erro_api' ? 'destructive' :
                          r.motivo === 'aguardando_validacao' ? 'secondary' : 'outline'
                        }>{r.motivo}</Badge>
                      </td>
                    </tr>
                  ))}
                  {!filteredAudit.length && (
                    <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Nenhum resultado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Motivos: <code>campo_ausente</code> = LI não retornou o campo · <code>valor_zero</code> = campo zerado no cadastro · <code>valor_parcial</code> = falta um dos 4 valores · <code>sem_vinculo</code> = precisa vincular em Mapeamento · <code>sem_correspondencia</code> = nome não bate com nenhum produto LI · <code>aguardando_validacao</code> = candidatos ambíguos · <code>erro_api</code> = falha na consulta · <code>bloqueado_atualizacao_logistica</code> = flag manual bloqueando.
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
