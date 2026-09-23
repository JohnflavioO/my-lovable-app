import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, BrainCircuit, Loader2, Link2, Star, History, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { useEquivalentSearch, useSearchHistory, useApprovedEquivalences, type ComparatorProduct } from '@/hooks/useEquivalentSearch';
import ResultCard from '@/components/comparator/ResultCard';
import AddToQuoteDialog from '@/components/comparator/AddToQuoteDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';

export default function EquipmentComparator() {
  const [input, setInput] = useState('');
  const search = useEquivalentSearch();
  const history = useSearchHistory();
  const approved = useApprovedEquivalences();
  const { isAdmin, isGestor } = useAuth();
  const canSeeDiagnostic = isAdmin || isGestor;
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const [addProduct, setAddProduct] = useState<ComparatorProduct | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addCompat, setAddCompat] = useState<number | undefined>(undefined);

  const externalInfo = useMemo(() => {
    const d = search.data?.extracted ?? {};
    return {
      brand: (d.brand as string) || undefined,
      model: (d.model as string) || undefined,
      url: (d.source_url as string) || undefined,
      input: input,
    };
  }, [search.data, input]);

  const handleSearch = (forceRefresh = false) => {
    const value = input.trim();
    if (!value) {
      toast.error('Digite algo para pesquisar');
      return;
    }
    if (value.length < 3) {
      toast.error('Digite ao menos 3 caracteres');
      return;
    }
    search.mutate({ input: value, forceRefresh });
  };

  const [catalogTest, setCatalogTest] = useState<Array<{ term: string; matches: number }> | null>(null);
  const [catalogTesting, setCatalogTesting] = useState(false);
  const runCatalogTest = async () => {
    setCatalogTesting(true);
    const terms = ['LED','COB','Bowens','daylight','5600K','iluminação','iluminador','Amaran','Aputure','60d','60x','80c'];
    const out: Array<{ term: string; matches: number }> = [];
    for (const t of terms) {
      const { data } = await (supabase as any).rpc('diagnose_product_search', { p_term: t });
      out.push({ term: t, matches: Number(data?.[0]?.matches ?? 0) });
    }
    setCatalogTest(out);
    setCatalogTesting(false);
  };

  const handleFavorite = async (id: string, current: boolean) => {
    const { error } = await (supabase as any)
      .from('equivalence_search_history')
      .update({ is_favorite: !current })
      .eq('id', id);
    if (error) return toast.error('Falha ao favoritar');
    history.refetch();
  };

  const handleDeleteHistory = async (id: string) => {
    const { error } = await (supabase as any)
      .from('equivalence_search_history')
      .delete()
      .eq('id', id);
    if (error) return toast.error('Falha ao apagar: ' + error.message);
    toast.success('Item removido do histórico');
    history.refetch();
  };

  const handleClearHistory = async () => {
    const items = (history.data ?? []).filter((h: any) => !h.is_favorite);
    if (items.length === 0) return;
    if (!confirm(`Apagar ${items.length} item(ns) do histórico? Favoritos serão mantidos.`)) return;
    const ids = items.map((h: any) => h.id);
    const { error } = await (supabase as any)
      .from('equivalence_search_history')
      .delete()
      .in('id', ids);
    if (error) return toast.error('Falha ao limpar: ' + error.message);
    toast.success('Histórico limpo');
    history.refetch();
  };

  const isUrl = /^https?:\/\//i.test(input.trim());

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold font-display">Comparador Inteligente de Equipamentos</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Encontre o produto MCI equivalente informando nome, modelo, código, SKU, marca, URL do concorrente ou uma descrição livre.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1 relative">
                {isUrl ? (
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder='Ex.: "Aputure 600d", "Canon C400", "SKU-12345" ou uma URL do produto'
                  className="pl-9"
                />
              </div>
              <Button onClick={() => handleSearch(false)} disabled={search.isPending} className="min-w-[140px]">
                {search.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Encontrar equivalente
              </Button>
              <Button onClick={() => handleSearch(true)} disabled={search.isPending} variant="outline" className="min-w-[140px]" title="Ignora cache e refaz a chamada">
                Refazer sem cache
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Nome</Badge>
              <Badge variant="outline">Modelo</Badge>
              <Badge variant="outline">Código / SKU</Badge>
              <Badge variant="outline">Marca</Badge>
              <Badge variant="outline">URL</Badge>
              <Badge variant="outline">Texto livre</Badge>
            </div>
          </CardContent>
        </Card>

        {search.isError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Não foi possível concluir a busca</p>
                <p className="text-xs text-muted-foreground">{(search.error as Error)?.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {search.data && (
          <div className="space-y-4">
            {/* Pesquisado */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Produto pesquisado</CardTitle>
              </CardHeader>
              <CardContent className="text-sm flex flex-wrap gap-x-6 gap-y-1">
                <div><span className="text-muted-foreground">Marca:</span> <span className="font-medium">{externalInfo.brand || '—'}</span></div>
                <div><span className="text-muted-foreground">Modelo:</span> <span className="font-medium">{externalInfo.model || '—'}</span></div>
                <div><span className="text-muted-foreground">Categoria:</span> <span className="font-medium">{(search.data.extracted?.category as string) || '—'}</span></div>
                {search.data.cached && <Badge variant="secondary">Cache</Badge>}
                {search.data.approved_match && <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Match aprovado</Badge>}
                {typeof search.data.response_time_ms === 'number' && (
                  <span className="text-xs text-muted-foreground ml-auto">{search.data.response_time_ms} ms</span>
                )}
              </CardContent>
            </Card>

            {search.data.message && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="p-3 text-xs">{search.data.message}</CardContent>
              </Card>
            )}

            {search.data.results.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  {search.data.message ?? 'Não encontramos produtos MCI relacionados a este equipamento no catálogo.'}
                </CardContent>
              </Card>
            ) : (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Melhores equivalentes MCI</p>
                <div className="grid gap-3">
                  {search.data.results.map((r, i) => (
                    <ResultCard
                      key={r.product.id + i}
                      result={r}
                      externalInfo={externalInfo}
                      onAdd={() => { setAddProduct(r.product); setAddCompat(r.compatibility); setAddOpen(true); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {canSeeDiagnostic && search.data.diagnostic && (
              <Card className="border-dashed">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Diagnóstico do agente (admin)</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setShowDiagnostic((v) => !v)}>
                    {showDiagnostic ? 'Ocultar' : 'Mostrar'}
                  </Button>
                </CardHeader>
                {showDiagnostic && (
                  <CardContent className="text-xs space-y-2">
                    <div><b>Entrada:</b> {search.data.diagnostic.input}</div>
                    <div><b>Modo:</b> {search.data.diagnostic.mode}</div>
                    <div><b>Marca:</b> {(search.data.extracted?.brand as string) ?? '—'} • <b>Modelo:</b> {(search.data.extracted?.model as string) ?? '—'} • <b>Categoria:</b> {(search.data.extracted?.category as string) ?? '—'}</div>
                    <div><b>Palavras-chave usadas:</b> {search.data.diagnostic.keywords?.join(', ') ?? '—'}</div>
                    <div><b>IA disponível:</b> {search.data.ai_available === false ? 'Não' : 'Sim'}</div>
                    <div>
                      <b>Passos:</b>
                      <ul className="list-disc list-inside ml-2">
                        {(search.data.diagnostic.steps ?? []).map((s, i) => (
                          <li key={i}>{s.step} <span className="text-muted-foreground">({s.at} ms) {s.count != null ? `• ${s.count} itens` : ''}</span></li>
                        ))}
                      </ul>
                    </div>
                    {(search.data.diagnostic.errors ?? []).length > 0 && (
                      <div className="text-rose-600">
                        <b>Erros:</b>
                        <ul className="list-disc list-inside ml-2">
                          {search.data.diagnostic.errors!.map((e, i) => (<li key={i}>{e.where}: {e.message}</li>))}
                        </ul>
                      </div>
                    )}
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <Button size="sm" variant="outline" onClick={runCatalogTest} disabled={catalogTesting}>
                          {catalogTesting ? 'Testando…' : 'Testar busca no catálogo'}
                        </Button>
                        <span className="text-muted-foreground">Roda buscas diretas por termos comuns.</span>
                      </div>
                      {catalogTest && (
                        <div className="flex flex-wrap gap-1">
                          {catalogTest.map((t) => (
                            <Badge key={t.term} variant={t.matches > 0 ? 'secondary' : 'outline'}>
                              {t.term}: {t.matches}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        )}

        <Tabs defaultValue="history" className="pt-2">
          <TabsList>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> Histórico</TabsTrigger>
            <TabsTrigger value="favorites"><Star className="h-4 w-4 mr-1" /> Favoritos</TabsTrigger>
            <TabsTrigger value="approved"><CheckCircle2 className="h-4 w-4 mr-1" /> Equivalências</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card>
              <CardContent className="p-3">
                {history.isLoading ? <p className="text-xs text-muted-foreground p-3">Carregando...</p> :
                  (history.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground p-3">Sem buscas ainda.</p> :
                  <>
                    <div className="flex items-center justify-between px-1 pb-2">
                      <span className="text-xs text-muted-foreground">{(history.data ?? []).length} item(ns)</span>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleClearHistory}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar histórico
                      </Button>
                    </div>
                    <ul className="divide-y">
                      {(history.data ?? []).map((h: any) => (
                        <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
                          <button onClick={() => handleFavorite(h.id, h.is_favorite)} title={h.is_favorite ? 'Desfavoritar' : 'Favoritar'}>
                            <Star className={`h-4 w-4 ${h.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="truncate">{h.input_value}</p>
                            <p className="text-xs text-muted-foreground">{h.input_type} • {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: ptBR })}</p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => { setInput(h.input_value); search.mutate(h.input_value); }}>Refazer</Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteHistory(h.id)} title="Apagar">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </>
                }
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="favorites">
            <Card>
              <CardContent className="p-3">
                {(history.data ?? []).filter((h: any) => h.is_favorite).length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">Nenhum favorito ainda.</p>
                ) : (
                  <ul className="divide-y">
                    {(history.data ?? []).filter((h: any) => h.is_favorite).map((h: any) => (
                      <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="flex-1 truncate">{h.input_value}</span>
                        <Button size="sm" variant="ghost" onClick={() => { setInput(h.input_value); search.mutate(h.input_value); }}>Refazer</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approved">
            <Card>
              <CardContent className="p-3">
                {(approved.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">Nenhuma equivalência aprovada ainda.</p>
                ) : (
                  <ul className="divide-y">
                    {(approved.data ?? []).map((eq: any) => (
                      <li key={eq.id} className="flex items-center gap-3 py-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{eq.marca_externa} {eq.modelo_externo}</p>
                          <p className="text-xs text-muted-foreground truncate">→ {eq.products?.name ?? eq.mci_product_id}</p>
                        </div>
                        <Badge variant="secondary">{Number(eq.confidence).toFixed(0)}%</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AddToQuoteDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        product={addProduct}
        compatibility={addCompat}
        searchInput={input}
        externalBrand={externalInfo.brand}
        externalModel={externalInfo.model}
      />
    </AppLayout>
  );
}
