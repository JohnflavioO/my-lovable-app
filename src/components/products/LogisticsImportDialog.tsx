import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Ban, HelpCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { calcVolumeM3, calcPesoCubado } from '@/lib/freight';

const db = supabase as any;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported?: () => void;
}

type RowStatus = 'update' | 'no_match' | 'zero_dims' | 'needs_validation' | 'blocked';

interface SheetRow {
  external_id: string;
  sku: string;
  code?: string;
  name: string;
  brand?: string;
  peso: number;
  altura: number;
  largura: number;
  comprimento: number;
}

interface PreviewRow {
  idx: number;
  sheet: SheetRow;
  match?: { id: string; name: string; sku?: string; code?: string; bloqueado: boolean; source: string };
  status: RowStatus;
}

const normalize = (s: any) =>
  (s ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

const toNum = (v: any) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const pick = (row: any, keys: string[]) => {
  const map: Record<string, any> = {};
  for (const k of Object.keys(row)) map[normalize(k)] = row[k];
  for (const k of keys) {
    const v = map[normalize(k)];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
};

export default function LogisticsImportDialog({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [report, setReport] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | RowStatus>('all');

  const reset = () => {
    setStep('upload'); setFileName(''); setRows([]); setReport(null); setProgress(0); setFilter('all');
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!json.length) { toast.error('Planilha vazia.'); setParsing(false); return; }

      const sheetRows: SheetRow[] = json.map((r) => ({
        external_id: String(pick(r, ['id', 'id-loja-integrada', 'external_id']) || '').trim(),
        sku: String(pick(r, ['sku', 'sku-pai', 'codigo-sku']) || '').trim(),
        code: String(pick(r, ['codigo', 'code', 'codigo-interno', 'mpn']) || '').trim(),
        name: String(pick(r, ['nome', 'name', 'produto', 'titulo']) || '').trim(),
        brand: String(pick(r, ['marca', 'brand', 'fabricante']) || '').trim(),
        peso: toNum(pick(r, ['peso-em-kg', 'peso_kg', 'peso', 'weight'])),
        altura: toNum(pick(r, ['altura-em-cm', 'altura_cm', 'altura', 'height'])),
        largura: toNum(pick(r, ['largura-em-cm', 'largura_cm', 'largura', 'width'])),
        comprimento: toNum(pick(r, ['comprimento-em-cm', 'comprimento_cm', 'comprimento', 'length'])),
      })).filter(r => r.external_id || r.sku || r.code || r.name);

      // Fetch all products
      const { data: products, error } = await db.from('products')
        .select('id, name, sku, code, loja_integrada_id, bloquear_atualizacao_logistica')
        .limit(5000);
      if (error) throw error;

      // Fetch external links (loja_integrada)
      const { data: links } = await db.from('product_external_links')
        .select('product_id, external_product_id, provider')
        .eq('provider', 'loja_integrada')
        .limit(10000);

      const byExternal = new Map<string, string>();
      (links || []).forEach((l: any) => { if (l.external_product_id) byExternal.set(String(l.external_product_id), l.product_id); });

      const byLojaIntegradaId = new Map<string, any>();
      const bySku = new Map<string, any>();
      const byCode = new Map<string, any>();
      const byName = new Map<string, any>();
      (products || []).forEach((p: any) => {
        if (p.loja_integrada_id) byLojaIntegradaId.set(String(p.loja_integrada_id), p);
        if (p.sku) bySku.set(normalize(p.sku), p);
        if (p.code) byCode.set(normalize(p.code), p);
        if (p.name) byName.set(normalize(p.name), p);
      });
      const productById = new Map<string, any>();
      (products || []).forEach((p: any) => productById.set(p.id, p));

      const preview: PreviewRow[] = sheetRows.map((s, idx) => {
        let match: any = null;
        let source = '';
        if (s.external_id) {
          const pid = byExternal.get(s.external_id);
          if (pid && productById.get(pid)) { match = productById.get(pid); source = 'external_id'; }
          if (!match && byLojaIntegradaId.get(s.external_id)) { match = byLojaIntegradaId.get(s.external_id); source = 'loja_integrada_id'; }
        }
        if (!match && s.sku) {
          const p = bySku.get(normalize(s.sku));
          if (p) { match = p; source = 'sku'; }
        }
        if (!match && s.code) {
          const p = byCode.get(normalize(s.code));
          if (p) { match = p; source = 'code'; }
        }
        if (!match && s.name) {
          const p = byName.get(normalize(s.name));
          if (p) { match = p; source = 'name'; }
        }

        let status: RowStatus;
        if (!match) status = 'no_match';
        else if (match.bloquear_atualizacao_logistica) status = 'blocked';
        else if (s.peso <= 0 && s.altura <= 0 && s.largura <= 0 && s.comprimento <= 0) status = 'zero_dims';
        else if (s.peso <= 0 || s.altura <= 0 || s.largura <= 0 || s.comprimento <= 0) status = 'needs_validation';
        else status = 'update';

        return {
          idx,
          sheet: s,
          match: match ? {
            id: match.id, name: match.name, sku: match.sku, code: match.code,
            bloqueado: !!match.bloquear_atualizacao_logistica, source,
          } : undefined,
          status,
        };
      });

      setRows(preview);
      setStep('preview');
    } catch (e: any) {
      toast.error('Erro ao ler planilha: ' + (e.message || e));
    } finally {
      setParsing(false);
    }
  };

  const stats = useMemo(() => {
    const s = { total: rows.length, update: 0, no_match: 0, zero_dims: 0, needs_validation: 0, blocked: 0 };
    rows.forEach(r => { (s as any)[r.status]++; });
    return s;
  }, [rows]);

  const filtered = useMemo(
    () => filter === 'all' ? rows : rows.filter(r => r.status === filter),
    [rows, filter],
  );

  const confirmImport = async () => {
    const toUpdate = rows.filter(r => r.status === 'update' || r.status === 'needs_validation');
    if (!toUpdate.length) { toast.info('Nada a importar.'); return; }
    setSaving(true);
    setProgress(0);
    const now = new Date().toISOString();
    let updated = 0, errors = 0;
    for (let i = 0; i < toUpdate.length; i++) {
      const r = toUpdate[i];
      const s = r.sheet;
      const patch: any = { logistica_atualizada_em: now, loja_integrada_sync_source: 'planilha_loja_integrada' };
      if (s.peso > 0) patch.peso_kg = s.peso;
      if (s.altura > 0) patch.altura_cm = s.altura;
      if (s.largura > 0) patch.largura_cm = s.largura;
      if (s.comprimento > 0) patch.comprimento_cm = s.comprimento;
      if (s.altura > 0 && s.largura > 0 && s.comprimento > 0) {
        patch.volume_m3 = Number(calcVolumeM3(s.altura, s.largura, s.comprimento).toFixed(6));
        patch.peso_cubado = Number(calcPesoCubado(s.altura, s.largura, s.comprimento).toFixed(3));
      }
      if (s.external_id) patch.loja_integrada_id = s.external_id;

      const { error } = await db.from('products').update(patch).eq('id', r.match!.id);
      if (error) errors++; else updated++;

      // Persist external link if we have an id
      if (s.external_id) {
        await db.from('product_external_links').upsert({
          product_id: r.match!.id,
          provider: 'loja_integrada',
          external_product_id: s.external_id,
          external_sku: s.sku || null,
          external_name: s.name || null,
          match_source: r.match!.source,
          sync_status: 'linked',
          last_sync_at: now,
        }, { onConflict: 'product_id,provider' }).then(() => {}, () => {});
      }

      setProgress(Math.round(((i + 1) / toUpdate.length) * 100));
    }
    setReport({
      encontrados_na_planilha: rows.length,
      atualizados: updated,
      sem_correspondencia: stats.no_match,
      peso_zerado: rows.filter(r => r.sheet.peso <= 0).length,
      dimensao_zerada: rows.filter(r => r.sheet.altura <= 0 || r.sheet.largura <= 0 || r.sheet.comprimento <= 0).length,
      bloqueados: stats.blocked,
      erros: errors,
    });
    setStep('done');
    setSaving(false);
    toast.success(`${updated} produto(s) atualizado(s).`);
    onImported?.();
  };

  const StatusBadge = ({ s }: { s: RowStatus }) => {
    const map = {
      update: { label: 'Atualizar', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
      no_match: { label: 'Sem correspondência', cls: 'bg-rose-100 text-rose-800 border-rose-200', Icon: X },
      zero_dims: { label: 'Peso/dim. zerados', cls: 'bg-amber-100 text-amber-800 border-amber-200', Icon: AlertTriangle },
      needs_validation: { label: 'Validar', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', Icon: HelpCircle },
      blocked: { label: 'Bloqueado', cls: 'bg-slate-200 text-slate-700 border-slate-300', Icon: Ban },
    } as const;
    const m = map[s];
    return <Badge variant="outline" className={`gap-1 ${m.cls}`}><m.Icon className="h-3 w-3" />{m.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <FileSpreadsheet className="h-5 w-5" /> Importar dados logísticos
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-6">
            <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-3">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Envie a planilha exportada da Loja Integrada</p>
                <p className="text-xs text-muted-foreground">
                  Colunas reconhecidas: id, sku, nome, marca, peso-em-kg, altura-em-cm, largura-em-cm, comprimento-em-cm
                </p>
              </div>
              <div className="flex items-center justify-center">
                <label className="inline-flex">
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <Button asChild variant="default" disabled={parsing}>
                    <span className="cursor-pointer">
                      {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Lendo…</> : 'Selecionar arquivo'}
                    </span>
                  </Button>
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Apenas peso e dimensões são atualizados. Preço, estoque e descrição permanecem inalterados.
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5 inline mr-1" />
                {fileName} · {stats.total} linhas
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  ['all', `Todos (${stats.total})`],
                  ['update', `Atualizar (${stats.update})`],
                  ['needs_validation', `Validar (${stats.needs_validation})`],
                  ['no_match', `Sem match (${stats.no_match})`],
                  ['zero_dims', `Zerados (${stats.zero_dims})`],
                  ['blocked', `Bloqueados (${stats.blocked})`],
                ] as const).map(([k, l]) => (
                  <Button key={k} size="sm" variant={filter === k ? 'default' : 'outline'} onClick={() => setFilter(k as any)}>
                    {l}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1 border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Produto (planilha)</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Produto CRM</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead className="text-right">A×L×C (cm)</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 500).map((r) => (
                    <TableRow key={r.idx}>
                      <TableCell className="max-w-[240px]">
                        <div className="text-xs font-medium truncate">{r.sheet.name || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">ID: {r.sheet.external_id || '—'} · {r.sheet.brand}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.sheet.sku || '—'}</TableCell>
                      <TableCell className="max-w-[240px]">
                        {r.match ? (
                          <div className="text-xs truncate">{r.match.name}
                            <div className="text-[10px] text-muted-foreground">SKU: {r.match.sku || '—'} · Cód: {r.match.code || '—'}</div>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{r.sheet.peso > 0 ? r.sheet.peso.toFixed(3) : '—'}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r.sheet.altura || r.sheet.largura || r.sheet.comprimento
                          ? `${r.sheet.altura}×${r.sheet.largura}×${r.sheet.comprimento}` : '—'}
                      </TableCell>
                      <TableCell className="text-[10px] uppercase text-muted-foreground">{r.match?.source || '—'}</TableCell>
                      <TableCell><StatusBadge s={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 500 && (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  Mostrando 500 de {filtered.length}. Todas serão processadas.
                </div>
              )}
            </ScrollArea>

            {saving && <Progress value={progress} className="h-2" />}

            <div className="flex justify-between items-center pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Serão atualizados: <strong>{stats.update + stats.needs_validation}</strong> ·
                Ignorados: {stats.no_match + stats.zero_dims + stats.blocked}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={saving}>Cancelar</Button>
                <Button onClick={confirmImport} disabled={saving || (stats.update + stats.needs_validation) === 0}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando…</> : 'Confirmar importação'}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'done' && report && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ['Encontrados na planilha', report.encontrados_na_planilha, 'text-foreground'],
                ['Atualizados', report.atualizados, 'text-emerald-600'],
                ['Sem correspondência', report.sem_correspondencia, 'text-rose-600'],
                ['Peso zerado', report.peso_zerado, 'text-amber-600'],
                ['Dimensão zerada', report.dimensao_zerada, 'text-amber-600'],
                ['Bloqueados', report.bloqueados, 'text-slate-600'],
                ['Erros', report.erros, 'text-rose-600'],
              ].map(([label, value, cls]) => (
                <div key={label as string} className="rounded-md border p-3">
                  <div className="text-[11px] text-muted-foreground uppercase">{label}</div>
                  <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value as number}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Nova importação</Button>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
