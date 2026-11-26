import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, RefreshCw, Search, ShieldCheck, Store, Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  categoryPath, linkTrust, rowStatus, targetPrice, unavailableReason,
  type LinkTrust, type LiSnapshot, type RowStatus,
} from './liPriceSync';

const db = supabase as any;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApplied: () => void;
  /** Quando informado, abre direto neste produto (botão de preço na linha da lista). */
  focusProduct?: { id: string; name: string } | null;
}

type Snap = LiSnapshot & { category_ids: string[]; external_name: string | null; fetched_at: string };
type Prod = { id: string; name: string; code: string | null; price: number | null };

async function fetchAll(build: () => any) {
  const rows: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export default function LiPriceSyncDialog({ open, onOpenChange, onApplied, focusProduct = null }: Props) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(null);
  const [categories, setCategories] = useState<{ id: string; nome: string; parent_id: string | null }[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [products, setProducts] = useState<Map<string, Prod>>(new Map());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState('');
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [trustInfo, setTrustInfo] = useState<Map<string, { code_matches: boolean; confirmed: boolean }>>(new Map());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [focusState, setFocusState] = useState<'idle' | 'loading' | 'not_linked' | 'ready'>('idle');
  const focusId = focusProduct?.id ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, snapRows, trustRows] = await Promise.all([
        fetchAll(() => db.from('li_categories').select('id, nome, parent_id').order('nome')),
        fetchAll(() => db.from('li_price_snapshot').select('product_id, preco_cheio, preco_promocional, sob_consulta, error, category_ids, external_name, fetched_at').order('product_id')),
        fetchAll(() => db.rpc('li_link_trust').order('product_id')),
      ]);
      setTrustInfo(new Map(trustRows.map((t: any) => [t.product_id, { code_matches: !!t.code_matches, confirmed: !!t.confirmed }])));
      const ids = snapRows.map((s: any) => s.product_id);
      const prodMap = new Map<string, Prod>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await db.from('products').select('id, name, code, price').in('id', ids.slice(i, i + 200));
        if (error) throw error;
        (data || []).forEach((p: Prod) => prodMap.set(p.id, p));
      }
      setCategories(cats);
      setSnaps(snapRows.map((s: any) => ({ ...s, preco_cheio: s.preco_cheio === null ? null : Number(s.preco_cheio), preco_promocional: s.preco_promocional === null ? null : Number(s.preco_promocional) })));
      setProducts(prodMap);
    } catch (e: any) {
      toast.error('Não foi possível carregar os preços da loja', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!focusId) { load(); return; }
    // Modo um produto: consulta a loja agora só para ele e depois carrega a comparação.
    (async () => {
      setFocusState('loading');
      try {
        const { data, error } = await supabase.functions.invoke('loja-integrada-precos', { body: { action: 'refresh_product', product_id: focusId } });
        if (error) throw error;
        if (data?.error && !data?.linked) throw new Error(data.error);
        if (data?.linked === false) { setFocusState('not_linked'); return; }
        await load();
        setFocusState('ready');
      } catch (e: any) {
        toast.error('Não foi possível consultar a loja', { description: e.message });
        setFocusState('idle');
      }
    })();
  }, [open, focusId, load]);

  // Baixa de novo categorias e preços da loja (só leitura da loja; não altera o CRM).
  const refreshFromStore = async () => {
    setRefreshing({ done: 0, total: 0 });
    try {
      const { error: catErr } = await supabase.functions.invoke('loja-integrada-precos', { body: { action: 'refresh_categories' } });
      if (catErr) throw catErr;
      let offset = 0;
      for (let guard = 0; guard < 100; guard++) {
        const { data, error } = await supabase.functions.invoke('loja-integrada-precos', { body: { action: 'refresh_prices', offset, limit: 40 } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setRefreshing({ done: data.processed, total: data.total });
        if (data.done) break;
        offset = data.processed;
      }
      await load();
      toast.success('Preços da loja atualizados');
    } catch (e: any) {
      toast.error('Falha ao buscar preços na loja', { description: e.message });
    } finally {
      setRefreshing(null);
    }
  };

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    snaps.forEach((s) => (s.category_ids || []).forEach((id) => m.set(id, (m.get(id) || 0) + 1)));
    return m;
  }, [snaps]);
  const categoryList = useMemo(() => {
    const q = catFilter.trim().toLowerCase();
    return [...catCounts.entries()]
      .map(([id, n]) => ({ id, n, path: categoryPath(id, catById) }))
      .filter((c) => !q || c.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
  }, [catCounts, catById, catFilter]);

  const rows = useMemo(() => {
    if (!categoryId && !focusId) return [];
    return snaps
      .filter((s) => (focusId ? s.product_id === focusId : (s.category_ids || []).includes(categoryId as string)) && products.has(s.product_id))
      .map((s) => {
        const p = products.get(s.product_id)!;
        const crm = Number(p.price) || 0;
        const ti = trustInfo.get(s.product_id);
        const trust: LinkTrust = linkTrust({ confirmed: !!ti?.confirmed, codeMatches: !!ti?.code_matches, crmName: p.name, storeName: s.external_name });
        return { s, p, crm, trust, target: targetPrice(s, 'list'), status: rowStatus(s, crm, 'list') as RowStatus };
      })
      .filter((r) => focusId || !onlyChanges || r.status === 'change' || r.status === 'suspicious')
      .sort((a, b) => a.p.name.localeCompare(b.p.name, 'pt-BR'));
  }, [snaps, products, categoryId, focusId, onlyChanges, trustInfo]);

  // Ao trocar categoria: pré-seleciona só as mudanças normais (as suspeitas ficam para conferência).
  useEffect(() => {
    setSelected(new Set(rows.filter((r) => r.status === 'change' && r.trust !== 'check').map((r) => r.p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, focusId, snaps, trustInfo]);

  // Só entra na seleção o que tem vínculo certeiro (código + nome conferidos, ou confirmado por alguém).
  const selectable = rows.filter((r) => r.trust !== 'check' && (r.status === 'change' || r.status === 'suspicious'));
  const pendingCheck = rows.filter((r) => r.trust === 'check' && r.status !== 'unavailable').length;

  const confirmLink = async (productId: string, same: boolean) => {
    setConfirming(productId);
    try {
      const { error } = await db.rpc('confirm_li_link', { _product_id: productId, _same: same });
      if (error) throw error;
      if (same) {
        setTrustInfo((prev) => new Map(prev).set(productId, { code_matches: prev.get(productId)?.code_matches ?? false, confirmed: true }));
        toast.success('Vínculo confirmado');
      } else {
        setSnaps((prev) => prev.filter((x) => x.product_id !== productId));
        toast.info('Produto retirado da sincronização', { description: 'Ele foi para a tela Mapeamento de Produtos para ser ligado ao item certo.' });
      }
    } catch (e: any) {
      toast.error('Não foi possível salvar', { description: e.message });
    } finally {
      setConfirming(null);
    }
  };
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const apply = async () => {
    const ids = [...selected].filter((id) => selectable.some((r) => r.p.id === id));
    if (!ids.length) return;
    setApplying(true);
    try {
      const { data, error } = await db.rpc('apply_li_prices', { _product_ids: ids, _mode: 'list', _category_id: focusId ? null : categoryId });
      if (error) throw error;
      const batch = data?.batch_id;
      toast.success(`${data?.updated ?? 0} preço(s) atualizado(s)`, {
        description: categoryId ? categoryPath(categoryId, catById) : undefined,
        duration: 15000,
        action: batch ? {
          label: 'Desfazer',
          onClick: async () => {
            const { data: rev, error: revErr } = await db.rpc('revert_price_batch', { _batch_id: batch });
            if (revErr) { toast.error('Não foi possível desfazer', { description: revErr.message }); return; }
            toast.info(`${rev?.reverted ?? 0} preço(s) restaurado(s)` + (rev?.kept ? ` · ${rev.kept} já alterado(s) depois, mantido(s)` : ''));
            await load();
            onApplied();
          },
        } : undefined,
      });
      await load();
      onApplied();
    } catch (e: any) {
      toast.error('Não foi possível aplicar', { description: e.message });
    } finally {
      setApplying(false);
    }
  };

  const lastFetch = snaps.reduce<string | null>((acc, s) => (!acc || s.fetched_at > acc ? s.fetched_at : acc), null);
  const selCount = selectable.filter((r) => selected.has(r.p.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-5 pb-3 border-b">
          <DialogTitle className="font-display flex items-center gap-2">
            <Store className="h-5 w-5" /> {focusId ? 'Preço pela Loja Integrada' : 'Atualizar preços pela Loja Integrada'}
          </DialogTitle>
          <DialogDescription>
            {focusId
              ? `Preço consultado agora na loja para "${focusProduct?.name}". Confira e aplique se estiver certo.`
              : 'Escolha uma categoria da loja, confira o preço cheio e aplique só o que quiser. Nada muda sem a sua confirmação, e cada aplicação pode ser desfeita.'}
          </DialogDescription>
          {!focusId && <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
            <span>{snaps.length} produtos vinculados · última consulta à loja: {lastFetch ? new Date(lastFetch).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca'}</span>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!!refreshing} onClick={refreshFromStore}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Buscar preços atuais na loja
            </Button>
          </div>}
          {refreshing && refreshing.total > 0 && (
            <div className="pt-2 space-y-1">
              <Progress value={(refreshing.done / refreshing.total) * 100} />
              <p className="text-[11px] text-muted-foreground tabular-nums">{refreshing.done} de {refreshing.total} produtos consultados</p>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Categorias */}
          {!focusId && <div className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r flex flex-col min-h-0 max-h-56 md:max-h-none">
            <div className="p-3 relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={catFilter} onChange={(e) => setCatFilter(e.target.value)} placeholder="Filtrar categorias" className="pl-8 h-9" aria-label="Filtrar categorias" />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3" role="listbox" aria-label="Categorias da loja">
              {loading ? (
                <p className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>
              ) : categoryList.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Nenhuma categoria. Clique em "Buscar preços atuais na loja".</p>
              ) : categoryList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                    categoryId === c.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <span className="min-w-0 truncate" title={c.path}>{c.path}</span>
                  <span className={cn('text-xs tabular-nums', categoryId === c.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{c.n}</span>
                </button>
              ))}
            </div>
          </div>}

          {/* Produtos da categoria */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {focusId && focusState !== 'ready' ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                {focusState === 'not_linked' ? (
                  <>
                    <Tag className="h-10 w-10 opacity-30 mb-2" />
                    <p className="text-sm font-medium text-foreground">Este produto não está ligado a nenhum item da loja.</p>
                    <p className="text-sm mt-1">Ligue-o em <a href="/mapeamento-produtos" className="text-primary underline">Mapeamento de Produtos</a> para puxar o preço.</p>
                  </>
                ) : (
                  <p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Consultando a loja...</p>
                )}
              </div>
            ) : !categoryId && !focusId ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Tag className="h-10 w-10 opacity-30 mb-2" />
                <p className="text-sm">Escolha uma categoria para comparar os preços.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b">
                  <p className="text-xs font-medium text-muted-foreground">Preço cheio da loja (sem promoção)</p>
                  {!focusId && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox checked={onlyChanges} onCheckedChange={(v) => setOnlyChanges(!!v)} /> Mostrar só os que mudam
                    </label>
                  )}
                </div>
                <div className="flex-1 overflow-auto">
                  {rows.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      {onlyChanges ? 'Todos os preços desta categoria já estão iguais aos da loja.' : 'Nenhum produto vinculado nesta categoria.'}
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background z-10 text-xs text-muted-foreground">
                        <tr className="border-b">
                          <th className="p-2 w-10">
                            <Checkbox
                              aria-label="Selecionar todos"
                              checked={selectable.length > 0 && selectable.every((r) => selected.has(r.p.id))}
                              onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((r) => r.p.id)) : new Set())}
                            />
                          </th>
                          <th className="p-2 text-left font-medium">Produto</th>
                          <th className="p-2 text-right font-medium">No CRM</th>
                          <th className="p-2 text-right font-medium">Loja: preço cheio</th>
                          <th className="p-2 text-right font-medium">Novo valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ s, p, crm, target, status, trust }) => {
                          const can = trust !== 'check' && (status === 'change' || status === 'suspicious');
                          const diff = target !== null && crm > 0 ? (target - crm) / crm : null;
                          return (
                            <tr key={p.id} className={cn('border-b align-top', (status === 'suspicious' || trust === 'check') && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                              <td className="p-2">
                                <Checkbox disabled={!can} checked={can && selected.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Atualizar ${p.name}`} />
                              </td>
                              <td className="p-2">
                                <p className="font-medium leading-snug flex items-center gap-1.5">
                                  {p.name}
                                  {trust !== 'check' && (
                                    <span title={trust === 'confirmed' ? 'Vínculo confirmado por uma pessoa' : 'Código e nome conferidos com a loja'} className="inline-flex">
                                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                                      <span className="sr-only">{trust === 'confirmed' ? 'Vínculo confirmado' : 'Vínculo conferido'}</span>
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">cód. {p.code || '—'}{trust !== 'check' && s.external_name && s.external_name !== p.name ? ` · na loja: ${s.external_name}` : ''}</p>
                                {trust === 'check' && status !== 'unavailable' && (
                                  <div className="mt-2 rounded-md border border-amber-300 bg-background p-2 text-xs">
                                    <p className="font-semibold text-amber-800 dark:text-amber-300">Confirme se é o mesmo produto antes de puxar o preço</p>
                                    <p className="mt-1"><span className="text-muted-foreground">No CRM:</span> {p.name} {p.code ? `(cód. ${p.code})` : '(sem código)'}</p>
                                    <p><span className="text-muted-foreground">Na loja:</span> {s.external_name || '—'}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <Button size="sm" variant="outline" className="h-7 gap-1 text-emerald-700" disabled={confirming === p.id} onClick={() => confirmLink(p.id, true)}>
                                        <Check className="h-3.5 w-3.5" /> É o mesmo produto
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 gap-1 text-red-700" disabled={confirming === p.id} onClick={() => confirmLink(p.id, false)}>
                                        <X className="h-3.5 w-3.5" /> Não é
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                {status === 'suspicious' && trust !== 'check' && (
                                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Diferença acima de 50% — confira se o produto está ligado ao item certo da loja
                                  </p>
                                )}
                                {status === 'unavailable' && <p className="mt-1 text-xs text-muted-foreground">{unavailableReason(s)}</p>}
                              </td>
                              <td className="p-2 text-right tabular-nums whitespace-nowrap">{crm > 0 ? brl(crm) : <span className="text-amber-700">sem preço</span>}</td>
                              <td className="p-2 text-right tabular-nums whitespace-nowrap">
                                {(s.preco_cheio ?? 0) > 0 ? brl(s.preco_cheio as number) : '—'}
                              </td>
                              <td className="p-2 text-right tabular-nums whitespace-nowrap">
                                {target !== null ? (
                                  <>
                                    <span className="font-semibold">{brl(target)}</span>
                                    {diff !== null && status !== 'same' && (
                                      <span className={cn('block text-xs', diff > 0 ? 'text-red-700' : 'text-emerald-700')}>
                                        {diff > 0 ? '+' : ''}{(diff * 100).toFixed(1).replace('.', ',')}%
                                      </span>
                                    )}
                                    {status === 'same' && <span className="block text-xs text-muted-foreground">igual</span>}
                                  </>
                                ) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
                  <p className="text-xs text-muted-foreground">
                    {selCount} de {selectable.length} selecionado(s). Diferenças acima de 50% não vêm marcadas.
                    {pendingCheck > 0 && <span className="ml-1 font-medium text-amber-800 dark:text-amber-300">{pendingCheck} aguardando confirmação de vínculo.</span>}
                  </p>
                  <Button onClick={apply} disabled={applying || selCount === 0} className="gap-2">
                    {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                    Aplicar {selCount} preço{selCount === 1 ? '' : 's'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
