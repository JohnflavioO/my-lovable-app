import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Link2, CheckCircle2, AlertTriangle, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';

const PROVIDER = 'loja_integrada';

type Product = {
  id: string;
  name: string;
  code: string | null;
  sku: string | null;
  brand: string | null;
  peso_kg: number | null;
  altura_cm: number | null;
  largura_cm: number | null;
  comprimento_cm: number | null;
  logistica_atualizada_em: string | null;
};

type Link = {
  id: string;
  product_id: string;
  external_product_id: string;
  external_sku: string | null;
  external_code: string | null;
  external_name: string | null;
  sync_status: string;
  match_source: string | null;
  last_sync_at: string | null;
  candidates: any[] | null;
};

type LICandidate = { id: string; sku: string | null; code: string | null; reference: string | null; name: string; score?: number };

export default function ProductMapping() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [links, setLinks] = useState<Record<string, Link>>({});
  const [filter, setFilter] = useState<'unlinked' | 'needs_validation' | 'linked' | 'not_found' | 'all'>('needs_validation');
  const [selected, setSelected] = useState<Product | null>(null);
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LICandidate[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [prodRes, linkRes] = await Promise.all([
      supabase.from('products').select('id,name,code,sku,brand,peso_kg,altura_cm,largura_cm,comprimento_cm,logistica_atualizada_em').order('name'),
      supabase.from('product_external_links').select('*').eq('provider', PROVIDER),
    ]);
    if (prodRes.error) toast.error(prodRes.error.message);
    if (linkRes.error) toast.error(linkRes.error.message);
    setProducts((prodRes.data as any) || []);
    const map: Record<string, Link> = {};
    for (const l of (linkRes.data as any[]) || []) map[l.product_id] = l;
    setLinks(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    return products.map(p => ({ product: p, link: links[p.id] || null }));
  }, [products, links]);

  const filtered = useMemo(() => rows.filter(({ link }) => {
    if (filter === 'linked') return link?.sync_status === 'linked';
    if (filter === 'needs_validation') return link?.sync_status === 'needs_validation';
    if (filter === 'not_found') return link?.sync_status === 'not_found';
    if (filter === 'unlinked') return !link || link.sync_status !== 'linked';
    return true;
  }), [rows, filter]);

  const openMap = (p: Product) => {
    setSelected(p);
    setTerm(p.name);
    const l = links[p.id];
    setResults(Array.isArray(l?.candidates) ? (l.candidates as any) : []);
  };

  const doSearch = async () => {
    if (!selected || term.trim().length < 2) return;
    setSearching(true); setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke('loja-integrada', {
        body: { action: 'search_li_products', search_term: term.trim() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha na busca');
      setResults(data.results || []);
      if (!data.results?.length) toast.info('Nenhum resultado.');
    } catch (e: any) { toast.error(e.message); } finally { setSearching(false); }
  };

  const link = async (cand: LICandidate) => {
    if (!selected) return;
    setLinking(cand.id);
    try {
      const { data, error } = await supabase.functions.invoke('loja-integrada', {
        body: { action: 'link_product', product_id: selected.id, li_id: cand.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao vincular');
      toast.success(data.dims_synced ? 'Vinculado e dimensões sincronizadas!' : 'Vinculado. Sem dimensões na origem.');
      setSelected(null); setResults([]);
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setLinking(null); }
  };

  const unlink = async (productId: string) => {
    if (!confirm('Desvincular este produto?')) return;
    setSyncing(productId);
    try {
      const { data, error } = await supabase.functions.invoke('loja-integrada', {
        body: { action: 'unlink_product', product_id: productId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error);
      toast.success('Vínculo removido');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setSyncing(null); }
  };

  const resync = async (productId: string) => {
    setSyncing(productId);
    try {
      const { data, error } = await supabase.functions.invoke('loja-integrada', {
        body: { action: 'sync_product_dimensions', product_ids: [productId] },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error);
      toast.success(`Sincronizado: ${data.updated || 0} atualizado(s)`);
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setSyncing(null); }
  };

  const StatusBadge = ({ link }: { link: Link | null }) => {
    if (!link) return <Badge variant="outline">Sem vínculo</Badge>;
    if (link.sync_status === 'linked') return <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Vinculado</Badge>;
    if (link.sync_status === 'needs_validation') return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Validar</Badge>;
    if (link.sync_status === 'not_found') return <Badge variant="secondary">Não encontrado</Badge>;
    if (link.sync_status === 'error') return <Badge variant="destructive">Erro</Badge>;
    return <Badge variant="outline">{link.sync_status}</Badge>;
  };

  const counts = {
    unlinked: rows.filter(r => !r.link || r.link.sync_status !== 'linked').length,
    needs_validation: rows.filter(r => r.link?.sync_status === 'needs_validation').length,
    linked: rows.filter(r => r.link?.sync_status === 'linked').length,
    not_found: rows.filter(r => r.link?.sync_status === 'not_found').length,
    all: rows.length,
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mapeamento de Produtos</h1>
          <p className="text-sm text-muted-foreground">A <strong>Sincronização Inteligente</strong> vincula automaticamente a maioria dos produtos. Esta tela é usada apenas para revisar os casos em que existem múltiplos candidatos ou nenhuma correspondência — os 3 melhores candidatos aparecem ordenados por similaridade.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {([
            { k: 'unlinked', label: 'Sem vínculo' },
            { k: 'needs_validation', label: 'Aguardando validação' },
            { k: 'linked', label: 'Vinculados' },
            { k: 'not_found', label: 'Não encontrados' },
            { k: 'all', label: 'Todos' },
          ] as const).map(t => (
            <Button key={t.k} size="sm" variant={filter === t.k ? 'default' : 'outline'} onClick={() => setFilter(t.k)}>
              {t.label} <Badge variant="secondary" className="ml-2">{counts[t.k]}</Badge>
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base">Produtos ({filtered.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
              ) : (
                <div className="max-h-[700px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr className="text-left">
                        <th className="p-2">Produto CRM</th>
                        <th className="p-2">LI</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Peso</th>
                        <th className="p-2">Dim</th>
                        <th className="p-2">Última sync</th>
                        <th className="p-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 300).map(({ product: p, link: l }) => {
                        const hasDims = p.altura_cm && p.largura_cm && p.comprimento_cm;
                        return (
                          <tr key={p.id} className="border-b hover:bg-muted/40">
                            <td className="p-2">
                              <p className="font-medium">{p.name}</p>
                              <p className="text-muted-foreground">SKU {p.sku || '—'} · Cód {p.code || '—'}</p>
                            </td>
                            <td className="p-2">
                              {l?.external_product_id && !l.external_product_id.startsWith('__unresolved__') ? (
                                <>
                                  <p>#{l.external_product_id}</p>
                                  <p className="text-muted-foreground truncate max-w-[180px]">{l.external_name}</p>
                                </>
                              ) : '—'}
                            </td>
                            <td className="p-2"><StatusBadge link={l} /></td>
                            <td className="p-2">{p.peso_kg ? `${p.peso_kg}kg` : <span className="text-red-500">—</span>}</td>
                            <td className="p-2">{hasDims ? `${p.altura_cm}×${p.largura_cm}×${p.comprimento_cm}` : <span className="text-red-500">—</span>}</td>
                            <td className="p-2">{l?.last_sync_at ? new Date(l.last_sync_at).toLocaleString('pt-BR') : '—'}</td>
                            <td className="p-2">
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => openMap(p)}>
                                  <Link2 className="h-3 w-3" />
                                </Button>
                                {l?.sync_status === 'linked' && (
                                  <>
                                    <Button size="sm" variant="outline" disabled={syncing === p.id} onClick={() => resync(p.id)}>
                                      {syncing === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={syncing === p.id} onClick={() => unlink(p.id)}>
                                      <Unlink className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length > 300 && <p className="p-3 text-xs text-muted-foreground text-center">Mostrando 300 de {filtered.length}.</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Vincular manualmente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!selected ? (
                <p className="text-sm text-muted-foreground">Clique no ícone <Link2 className="inline h-3 w-3" /> em um produto para buscar equivalentes.</p>
              ) : (
                <>
                  <div className="rounded-md bg-muted/40 p-3 text-xs">
                    <p className="font-medium">{selected.name}</p>
                    <p className="text-muted-foreground">SKU: {selected.sku || '—'} · Código: {selected.code || '—'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Input value={term} onChange={e => setTerm(e.target.value)} placeholder="Buscar por nome, SKU ou código" onKeyDown={e => e.key === 'Enter' && doSearch()} />
                    <Button onClick={doSearch} disabled={searching}>
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="max-h-[500px] overflow-auto space-y-2">
                    {results.map(r => (
                      <div key={r.id} className="border rounded-md p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{r.name}</p>
                            <p className="text-muted-foreground">
                              ID: {r.id} · SKU: {r.sku || '—'} · Cód: {r.code || '—'} · Ref: {r.reference || '—'}
                              {r.score !== undefined && <> · {Math.round(r.score * 100)}%</>}
                            </p>
                          </div>
                          <Button size="sm" onClick={() => link(r)} disabled={linking === r.id}>
                            {linking === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                            Vincular
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
