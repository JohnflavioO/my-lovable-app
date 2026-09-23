import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, Package, Link, Loader2, Image, ImageDown, Download, Activity, X, Truck, RefreshCw, Lock, FileSpreadsheet } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseMoneyBR } from '@/utils/currency';
import LogisticsImportDialog from '@/components/products/LogisticsImportDialog';

const formatBR = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const db = supabase as any;
const PRODUCT_FIELDS = 'id, name, sku, code, brand, category_principal, description, price, image_url, peso_kg, altura_cm, largura_cm, comprimento_cm, peso_cubado, volume_m3, origem_cep, embalagem_tipo, bloquear_atualizacao_logistica, logistica_atualizada_em, loja_integrada_sync_source';

// ---------- Busca inteligente ----------
const normalize = (s: any): string =>
  (s ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

const tokenize = (s: string): string[] => normalize(s).split(' ').filter(t => t.length > 0);

const rankProduct = (p: any, normQuery: string, tokens: string[]): number => {
  const n = normalize(p.name);
  const sku = normalize(p.sku);
  const code = normalize(p.code);
  const brand = normalize(p.brand);
  const cat = normalize(p.category_principal);
  const desc = normalize(p.description);
  let score = 0;
  if (normQuery) {
    if (n === normQuery) score += 1000;
    else if (n.startsWith(normQuery)) score += 500;
    else if (n.includes(normQuery)) score += 250;
    if (sku === normQuery || code === normQuery) score += 400;
    else if (sku.includes(normQuery) || code.includes(normQuery)) score += 200;
    if (brand.includes(normQuery)) score += 100;
    if (cat.includes(normQuery)) score += 80;
    if (desc.includes(normQuery)) score += 40;
  }
  for (const t of tokens) {
    if (n.includes(t)) score += 30;
    if (sku.includes(t) || code.includes(t)) score += 20;
    if (brand.includes(t)) score += 10;
    if (cat.includes(t)) score += 8;
    if (desc.includes(t)) score += 4;
  }
  return score;
};

const highlightText = (text: any, tokens: string[]): any => {
  const str = (text ?? '').toString();
  if (!str || tokens.length === 0) return str;
  const escaped = tokens
    .filter(t => t && t.length > 0)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return str;
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = str.split(re);
  return parts.map((part, i) =>
    re.test(part)
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 rounded-sm px-0.5">{part}</mark>
      : <span key={i}>{part}</span>
  );
};

export default function Products() {
  const { hasPermission } = usePermissions();
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: '', sku: '', code: '', brand: '', description: '', price: '' as string, image_url: '',
    peso_kg: '' as string, altura_cm: '' as string, largura_cm: '' as string, comprimento_cm: '' as string,
    peso_cubado: '' as string, volume_m3: '' as string, origem_cep: '', embalagem_tipo: '',
    bloquear_atualizacao_logistica: false,
  });
  const [syncingLI, setSyncingLI] = useState(false);
  const [bulkSyncingLI, setBulkSyncingLI] = useState(false);
  const [noLogisticFilter, setNoLogisticFilter] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [totalProducts, setTotalProducts] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0, found: 0 });
  const [searching, setSearching] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diag, setDiag] = useState<any | null>(null);
  const [logisticsImportOpen, setLogisticsImportOpen] = useState(false);
  const searchEffectMounted = useRef(false);

  const normQuery = normalize(search);
  const tokens = tokenize(search);
  const isSearching = tokens.length > 0;
  const canCreateProducts = hasPermission('products.create');
  const canEditProducts = hasPermission('products.edit');
  const canDeleteProducts = hasPermission('products.delete');
  const canModifyProducts = canEditProducts || canDeleteProducts;

  const loadProducts = async () => {
    setSuggestion(null);

    // Sem busca: paginação normal
    if (!isSearching) {
      let q = db.from('products').select(PRODUCT_FIELDS, { count: 'exact' }).order('name');
      if (noLogisticFilter) {
        q = q.or('peso_kg.is.null,altura_cm.is.null,largura_cm.is.null,comprimento_cm.is.null,peso_kg.eq.0,altura_cm.eq.0,largura_cm.eq.0,comprimento_cm.eq.0');
      }
      const { data, count, error } = await q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) { toast.error(error.message); return; }
      setProducts(data || []);
      setTotalProducts(count ?? 0);
      return;
    }

    setSearching(true);
    try {
      // Cada token precisa aparecer em algum campo (AND entre tokens, OR entre campos)
      let q = db.from('products').select(PRODUCT_FIELDS).limit(500);
      for (const t of tokens) {
        const safe = t.replace(/[%,()]/g, '');
        if (!safe) continue;
        q = q.or(
          `name.ilike.%${safe}%,sku.ilike.%${safe}%,code.ilike.%${safe}%,brand.ilike.%${safe}%,category_principal.ilike.%${safe}%,description.ilike.%${safe}%`
        );
      }
      const { data, error } = await q;
      if (error) { toast.error(error.message); return; }

      const ranked = (data || [])
        .map((p: any) => ({ p, score: rankProduct(p, normQuery, tokens) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.p);

      setProducts(ranked);
      setTotalProducts(ranked.length);

      // Sugestão "Você quis dizer..." quando vazio
      if (ranked.length === 0 && tokens[0]?.length >= 2) {
        const prefix = tokens[0].slice(0, Math.min(4, tokens[0].length));
        const { data: sug } = await db.from('products')
          .select('name, brand')
          .or(`name.ilike.${prefix}%,brand.ilike.${prefix}%`)
          .limit(1);
        if (sug && sug.length > 0) {
          const guess = (sug[0].name || sug[0].brand || '').split(' ')[0];
          if (guess) setSuggestion(guess);
        }
      }
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!searchEffectMounted.current) {
      searchEffectMounted.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      if (page !== 0) setPage(0);
      else loadProducts();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => { loadProducts(); }, [page, noLogisticFilter]);

  const runDiagnostic = async () => {
    setDiag(null);
    setDiagOpen(true);
    const [total, semCat, semSku, semCode, semImg] = await Promise.all([
      db.from('products').select('id', { count: 'exact', head: true }),
      db.from('products').select('id', { count: 'exact', head: true }).or('category_principal.is.null,category_principal.eq.'),
      db.from('products').select('id', { count: 'exact', head: true }).or('sku.is.null,sku.eq.'),
      db.from('products').select('id', { count: 'exact', head: true }).or('code.is.null,code.eq.'),
      db.from('products').select('id', { count: 'exact', head: true }).is('image_url', null),
    ]);
    setDiag({
      total: total.count ?? 0,
      semCategoria: semCat.count ?? 0,
      semSku: semSku.count ?? 0,
      semCode: semCode.count ?? 0,
      semImagem: semImg.count ?? 0,
    });
  };


  const toNum = (s: string): number | null => {
    if (!s || !String(s).trim()) return null;
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  // Verifica duplicidade antes de salvar (código, SKU ou nome+marca)
  const findDuplicate = async (): Promise<string | null> => {
    const norm = (v: string) => (v || '').trim();
    const code = norm(form.code);
    const sku = norm(form.sku);
    const name = norm(form.name);
    const brand = norm(form.brand);

    const check = async (filters: (q: any) => any, label: string) => {
      let q = db.from('products').select('id, name, code, sku, brand').limit(5);
      q = filters(q);
      if (editing?.id) q = q.neq('id', editing.id);
      const { data } = await q;
      return data && data.length > 0 ? label : null;
    };

    if (code) {
      const r = await check((q: any) => q.ilike('code', code), `Já existe um produto com o código "${code}".`);
      if (r) return r;
    }
    if (sku) {
      const r = await check((q: any) => q.ilike('sku', sku), `Já existe um produto com o SKU "${sku}".`);
      if (r) return r;
    }
    if (name) {
      const r = await check(
        (q: any) => (brand ? q.ilike('name', name).ilike('brand', brand) : q.ilike('name', name)),
        `Já existe um produto com o nome "${name}"${brand ? ` da marca ${brand}` : ''}.`
      );
      if (r) return r;
    }
    return null;
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return; }
    try {
      const dup = await findDuplicate();
      if (dup) { toast.error(`Produto duplicado. ${dup}`); return; }

      const payload: any = {
        name: form.name, sku: form.sku, code: form.code, brand: form.brand,
        description: form.description, price: parseMoneyBR(form.price), image_url: form.image_url,
        peso_kg: toNum(form.peso_kg),
        altura_cm: toNum(form.altura_cm),
        largura_cm: toNum(form.largura_cm),
        comprimento_cm: toNum(form.comprimento_cm),
        peso_cubado: toNum(form.peso_cubado),
        volume_m3: toNum(form.volume_m3),
        origem_cep: (form.origem_cep || '').replace(/\D/g, '').slice(0, 8) || null,
        embalagem_tipo: form.embalagem_tipo || null,
        bloquear_atualizacao_logistica: !!form.bloquear_atualizacao_logistica,
      };
      if (editing) {
        const { error } = await db.from('products').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Produto atualizado!');
      } else {
        const { error } = await db.from('products').insert(payload);
        if (error) throw error;
        toast.success('Produto cadastrado!');
      }
      setDialogOpen(false);
      resetForm();
      loadProducts();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEdit = (product: any) => {
    setEditing(product);
    const s = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
    setForm({
      name: product.name || '', sku: product.sku || '', code: product.code || '',
      brand: product.brand || '', description: product.description || '',
      price: product.price != null && product.price !== '' ? formatBR(parseFloat(product.price) || 0) : '', image_url: product.image_url || '',
      peso_kg: s(product.peso_kg),
      altura_cm: s(product.altura_cm),
      largura_cm: s(product.largura_cm),
      comprimento_cm: s(product.comprimento_cm),
      peso_cubado: s(product.peso_cubado),
      volume_m3: s(product.volume_m3),
      origem_cep: product.origem_cep || '',
      embalagem_tipo: product.embalagem_tipo || '',
      bloquear_atualizacao_logistica: !!product.bloquear_atualizacao_logistica,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este produto?')) return;
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Produto excluído'); loadProducts(); }
  };

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: '', sku: '', code: '', brand: '', description: '', price: '', image_url: '',
      peso_kg: '', altura_cm: '', largura_cm: '', comprimento_cm: '',
      peso_cubado: '', volume_m3: '', origem_cep: '', embalagem_tipo: '',
      bloquear_atualizacao_logistica: false,
    });
    setScrapeUrl('');
  };

  const handleFetchImages = async () => {
    const { data: allProducts } = await db.from('products')
      .select('id, name, code, sku, brand')
      .is('image_url', null)
      .order('name');

    if (!allProducts || allProducts.length === 0) {
      toast.info('Todos os produtos já possuem imagem!');
      return;
    }

    setFetchingImages(true);
    setImageProgress({ current: 0, total: allProducts.length, found: 0 });
    let found = 0;

    for (let i = 0; i < allProducts.length; i += 10) {
      const batch = allProducts.slice(i, i + 10);
      try {
        const { data, error } = await supabase.functions.invoke('fetch-mci-image', {
          body: { products: batch },
        });
        if (error) throw error;
        if (data?.success && data.results) {
          for (const result of data.results) {
            if (result.image_url) {
              await db.from('products').update({ image_url: result.image_url }).eq('id', result.id);
              found++;
            }
          }
        }
      } catch (err: any) {
        console.error('Batch error:', err);
      }
      setImageProgress({ current: Math.min(i + 10, allProducts.length), total: allProducts.length, found });
    }

    setFetchingImages(false);
    toast.success(`Imagens encontradas: ${found} de ${allProducts.length} produtos`);
    loadProducts();
  };

  const handleScrape = async () => {
    const trimmed = scrapeUrl.trim();
    if (!trimmed) {
      toast.error('Insira uma URL para importar');
      return;
    }
    // Basic URL validation
    let testUrl = trimmed;
    if (!testUrl.startsWith('http')) testUrl = `https://${testUrl}`;
    try { new URL(testUrl); } catch {
      toast.error('URL inválida. Verifique o endereço e tente novamente.');
      return;
    }

    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-product', {
        body: { url: trimmed },
      });

      // supabase.functions.invoke returns error for non-2xx OR network issues
      if (error) {
        // Try to parse body for friendly message
        const msg = data?.error || 'Falha na conexão com o servidor. Tente novamente.';
        toast.error(msg);
        return;
      }

      if (data?.ok === false || (!data?.success && !data?.ok)) {
        toast.error(data?.error || 'Não foi possível extrair dados do produto. Tente preencher manualmente.');
        return;
      }

      if (data?.data) {
        const d = data.data;
        setForm(prev => ({
          ...prev,
          name: d.name || prev.name,
          description: d.description || prev.description,
          image_url: d.image_url || prev.image_url,
          price: d.price ? formatBR(parseMoneyBR(d.price)) : prev.price,
          brand: d.brand || prev.brand,
          sku: d.sku || prev.sku,
        }));
        const fields = [d.name, d.description, d.image_url, d.brand, d.sku].filter(Boolean).length + (d.price > 0 ? 1 : 0);
        if (fields < 6) {
          toast.success(`Importados ${fields} de 6 campos. Complete os demais manualmente.`);
        } else {
          toast.success('Todos os dados importados com sucesso!');
        }
      }
    } catch (err: any) {
      toast.error('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setScraping(false);
    }
  };

  const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

  const handleExportProducts = async () => {
    setExporting(true);
    try {
      const allProducts: any[] = [];
      const batchSize = 1000;
      for (let from = 0; ; from += batchSize) {
        const { data, error } = await db.from('products')
          .select('sku, code, name, brand, description, price, image_url')
          .order('name')
          .range(from, from + batchSize - 1);
        if (error) throw error;
        allProducts.push(...(data || []));
        if (!data || data.length < batchSize) break;
      }

      const rows = [
        ['SKU', 'Código', 'Nome', 'Marca', 'Descrição', 'Valor', 'URL da Imagem'],
        ...allProducts.map((p) => [p.sku, p.code, p.name, p.brand, p.description, p.price, p.image_url]),
      ];
      const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(';')).join('\n')}`;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `produtos-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${allProducts.length} produtos exportados em CSV.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao exportar produtos');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const runLojaIntegradaSync = async (product_ids?: string[], all_products = false) => {
    const { data, error } = await supabase.functions.invoke('loja-integrada', {
      body: { action: 'sync_product_dimensions', product_ids, all_products },
    });
    if (error) throw new Error(error.message || 'Falha ao sincronizar');
    if (data?.ok === false) throw new Error(data?.error || 'Falha ao sincronizar');
    return data as { updated: number; not_found: number; skipped: number; errors: number; total: number };
  };

  const handleSyncSingleLI = async (productId: string) => {
    setSyncingLI(true);
    try {
      const res = await runLojaIntegradaSync([productId]);
      if (res.updated > 0) {
        toast.success('Dados logísticos atualizados da Loja Integrada.');
        // Refresh product in form if it's the currently edited one
        const { data: fresh } = await db.from('products').select(PRODUCT_FIELDS).eq('id', productId).maybeSingle();
        if (fresh && editing?.id === productId) handleEdit(fresh);
        loadProducts();
      } else if (res.not_found > 0) {
        toast.warning('Produto não encontrado na Loja Integrada. Verifique o SKU ou código.');
      } else if (res.skipped > 0) {
        toast.info('Produto encontrado, mas sem dados logísticos preenchidos na Loja Integrada.');
      } else {
        toast.info('Nada a atualizar.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao sincronizar');
    } finally {
      setSyncingLI(false);
    }
  };

  const handleBulkSyncLI = async () => {
    const scopeMsg = noLogisticFilter
      ? 'Sincronizar dados logísticos de TODOS os produtos sem peso/dimensões?'
      : 'Sincronizar peso e dimensões de TODOS os produtos da Loja Integrada? Isso pode levar alguns minutos.';
    if (!confirm(scopeMsg)) return;
    setBulkSyncingLI(true);
    try {
      let ids: string[] | undefined;
      let all = true;
      if (noLogisticFilter) {
        const { data } = await db.from('products')
          .select('id')
          .or('peso_kg.is.null,altura_cm.is.null,largura_cm.is.null,comprimento_cm.is.null,peso_kg.eq.0,altura_cm.eq.0,largura_cm.eq.0,comprimento_cm.eq.0')
          .limit(500);
        ids = (data || []).map((p: any) => p.id);
        all = false;
        if (ids.length === 0) {
          toast.info('Nenhum produto sem dados logísticos.');
          return;
        }
      }
      const res = await runLojaIntegradaSync(ids, all);
      toast.success(`Sincronização concluída: ${res.updated} atualizados, ${res.not_found} não encontrados, ${res.skipped} sem dados, ${res.errors} erros.`);
      loadProducts();
    } catch (e: any) {
      toast.error(e.message || 'Erro na sincronização em massa');
    } finally {
      setBulkSyncingLI(false);
    }
  };


  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">Produtos</h1>
          <p className="text-muted-foreground text-sm">Gerencie o catálogo de produtos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2 min-h-[44px] text-sm" onClick={handleExportProducts} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar CSV
          </Button>
          <Button variant="outline" className="gap-2 min-h-[44px] text-sm" onClick={runDiagnostic}>
            <Activity className="h-4 w-4" /> Verificar Indexação
          </Button>
          <Button
            variant={noLogisticFilter ? 'default' : 'outline'}
            className="gap-2 min-h-[44px] text-sm"
            onClick={() => { setPage(0); setNoLogisticFilter(v => !v); }}
          >
            <Truck className="h-4 w-4" /> Sem dados logísticos
          </Button>
          {canEditProducts && (
            <Button variant="outline" className="gap-2 min-h-[44px] text-sm" onClick={handleBulkSyncLI} disabled={bulkSyncingLI}>
              {bulkSyncingLI ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar pesos e dimensões da Loja Integrada
            </Button>
          )}
          {canEditProducts && (
            <Button variant="outline" className="gap-2 min-h-[44px] text-sm" onClick={() => setLogisticsImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" /> Importar dados logísticos
            </Button>
          )}
          {canEditProducts && (
            <Button variant="outline" className="gap-2 min-h-[44px] text-sm" onClick={handleFetchImages} disabled={fetchingImages}>
              <ImageDown className="h-4 w-4" />
              {fetchingImages ? 'Buscando...' : 'Buscar Imagens'}
            </Button>
          )}
          {(canCreateProducts || canEditProducts) && (
            <>
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
              {canCreateProducts && (
                <DialogTrigger asChild>
                  <Button className="gap-2 min-h-[44px]"><Plus className="h-4 w-4" /> Novo Produto</Button>
                </DialogTrigger>
              )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">
                  {editing ? 'Editar Produto' : 'Novo Produto'}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2"><Link className="h-4 w-4" /> Importar do site</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Cole o link do produto..."
                      value={scrapeUrl}
                      onChange={e => setScrapeUrl(e.target.value)}
                    />
                    <Button onClick={handleScrape} disabled={scraping} variant="outline" className="shrink-0 min-h-[44px]">
                      {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Importar'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome / Título *</Label>
                    <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome do produto" />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} placeholder="Número SKU" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="Código interno" />
                  </div>
                  <div className="space-y-2">
                    <Label>Marca</Label>
                    <Input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} placeholder="Marca" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descrição detalhada do produto" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input type="text" inputMode="decimal" placeholder="0,00" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} onBlur={e => { const v = e.target.value.trim(); if (v) setForm(p => ({ ...p, price: formatBR(parseMoneyBR(v)) })); }} />
                  </div>
                  <div className="space-y-2">
                    <Label>URL da Imagem</Label>
                    <Input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..." />
                  </div>
                </div>

                {form.image_url && (
                  <div className="flex justify-center p-3 border rounded-lg bg-muted/10">
                    <img src={form.image_url} alt="Preview" className="max-h-32 object-contain rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}

                {/* Peso e Dimensões para cálculo de frete */}
                <div className="p-3 rounded-lg border bg-muted/20 space-y-3">
                  <Label className="text-sm font-medium">Peso & Dimensões (para cálculo de frete)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Peso (kg)</Label>
                      <Input inputMode="decimal" placeholder="0,00" value={form.peso_kg}
                        onChange={e => setForm(p => ({ ...p, peso_kg: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Altura (cm)</Label>
                      <Input inputMode="decimal" placeholder="0" value={form.altura_cm}
                        onChange={e => setForm(p => ({ ...p, altura_cm: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Largura (cm)</Label>
                      <Input inputMode="decimal" placeholder="0" value={form.largura_cm}
                        onChange={e => setForm(p => ({ ...p, largura_cm: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Comprimento (cm)</Label>
                      <Input inputMode="decimal" placeholder="0" value={form.comprimento_cm}
                        onChange={e => setForm(p => ({ ...p, comprimento_cm: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Peso cubado (kg)</Label>
                      <Input inputMode="decimal" placeholder="auto" value={form.peso_cubado}
                        onChange={e => setForm(p => ({ ...p, peso_cubado: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Volume (m³)</Label>
                      <Input inputMode="decimal" placeholder="auto" value={form.volume_m3}
                        onChange={e => setForm(p => ({ ...p, volume_m3: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CEP de origem</Label>
                      <Input maxLength={9} placeholder="00000-000" value={form.origem_cep}
                        onChange={e => setForm(p => ({ ...p, origem_cep: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Embalagem</Label>
                      <Input placeholder="Ex: Caixa, Palete..." value={form.embalagem_tipo}
                        onChange={e => setForm(p => ({ ...p, embalagem_tipo: e.target.value }))} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Se peso cubado / volume ficarem em branco, o CRM calcula automaticamente a partir das dimensões (fator 300 kg/m³).
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={form.bloquear_atualizacao_logistica}
                        onCheckedChange={(v) => setForm(p => ({ ...p, bloquear_atualizacao_logistica: !!v }))}
                      />
                      <Lock className="h-3 w-3" />
                      Bloquear atualização automática (proteger dados manuais)
                    </label>
                    {editing && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleSyncSingleLI(editing.id)}
                        disabled={syncingLI || form.bloquear_atualizacao_logistica}
                      >
                        {syncingLI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Sincronizar dados da Loja Integrada
                      </Button>
                    )}
                  </div>
                  {editing?.logistica_atualizada_em && (
                    <p className="text-[10px] text-muted-foreground">
                      Última sincronização: {new Date(editing.logistica_atualizada_em).toLocaleString('pt-BR')}
                      {editing.loja_integrada_sync_source && ` · casado por ${editing.loja_integrada_sync_source}`}
                    </p>
                  )}
                </div>


                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)} className="min-h-[44px]">Cancelar</Button>
                  <Button onClick={handleSave} className="min-h-[44px]">Salvar Produto</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
            </>
          )}
        </div>
      </div>

      {fetchingImages && (
        <div className="mb-4 p-4 rounded-lg border bg-muted/20 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Buscando imagens...</span>
            <span>{imageProgress.current}/{imageProgress.total} • {imageProgress.found} encontradas</span>
          </div>
          <Progress value={(imageProgress.current / imageProgress.total) * 100} />
        </div>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, SKU, código, marca, categoria ou descrição..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex gap-2 text-sm text-muted-foreground items-center flex-wrap">
              <span className="px-2 font-medium">
                {searching ? 'Buscando...' : `${totalProducts} produto(s) encontrado(s)`}
              </span>
              {!isSearching && (
                <>
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="min-h-[44px] sm:min-h-0">Anterior</Button>
                  <span className="flex items-center px-2">Pág. {page + 1} de {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} className="min-h-[44px] sm:min-h-0">Próxima</Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground mt-3">Nenhum produto encontrado</p>
              {suggestion && (
                <button
                  type="button"
                  onClick={() => setSearch(suggestion)}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Você quis dizer <strong>{suggestion}</strong>?
                </button>
              )}
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {products.map((p: any) => (
                <div key={p.id} className="p-3 rounded-lg border bg-muted/30 flex gap-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-14 h-14 object-contain rounded shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="w-14 h-14 bg-muted rounded flex items-center justify-center shrink-0">
                      <Image className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{highlightText(p.name, tokens)}</p>
                    <p className="text-xs text-muted-foreground">
                      {highlightText(p.brand || '-', tokens)} • {highlightText(p.code || '-', tokens)}
                      {p.sku ? <> • SKU {highlightText(p.sku, tokens)}</> : null}
                    </p>
                    <p className="text-sm font-semibold mt-1">{formatCurrency(parseFloat(p.price) || 0)}</p>
                  </div>
                  {canModifyProducts && (
                    <div className="flex flex-col gap-1 shrink-0">
                      {canEditProducts && (
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(p)} className="h-10 w-10">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDeleteProducts && (
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)} className="h-10 w-10">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Foto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Marca</TableHead>
                  {noLogisticFilter ? (
                    <TableHead>Status logístico</TableHead>
                  ) : (
                    <TableHead>Valor</TableHead>
                  )}
                  {canModifyProducts && <TableHead className="w-28">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p: any) => {
                  const semDados = !p.peso_kg || !p.altura_cm || !p.largura_cm || !p.comprimento_cm;
                  return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-10 h-10 object-contain rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                          <Image className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{highlightText(p.sku || '-', tokens)}</TableCell>
                    <TableCell className="text-xs">{highlightText(p.code || '-', tokens)}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{highlightText(p.name, tokens)}</TableCell>
                    <TableCell>{highlightText(p.brand || '-', tokens)}</TableCell>
                    {noLogisticFilter ? (
                      <TableCell className="text-xs">
                        {p.bloquear_atualizacao_logistica ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" />Bloqueado</span>
                        ) : semDados ? (
                          <span className="text-amber-600 dark:text-amber-400">Sem dados</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                        )}
                      </TableCell>
                    ) : (
                      <TableCell>{formatCurrency(parseFloat(p.price) || 0)}</TableCell>
                    )}
                    {canModifyProducts && (
                      <TableCell>
                        <div className="flex gap-1">
                          {canEditProducts && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Sincronizar Loja Integrada"
                                onClick={() => handleSyncSingleLI(p.id)}
                                disabled={syncingLI || p.bloquear_atualizacao_logistica}
                              >
                                {syncingLI ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" title="Editar" onClick={() => handleEdit(p)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {canDeleteProducts && !noLogisticFilter && (
                            <Button size="icon" variant="ghost" title="Excluir" onClick={() => handleDelete(p.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Activity className="h-5 w-5" /> Diagnóstico de Indexação
            </DialogTitle>
          </DialogHeader>
          {!diag ? (
            <div className="py-6 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando catálogo...
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-2 rounded bg-muted/40"><span>Total de produtos ativos</span><strong>{diag.total}</strong></div>
              <div className="flex justify-between p-2 rounded bg-muted/40"><span>Sem categoria</span><strong>{diag.semCategoria}</strong></div>
              <div className="flex justify-between p-2 rounded bg-muted/40"><span>Sem SKU</span><strong>{diag.semSku}</strong></div>
              <div className="flex justify-between p-2 rounded bg-muted/40"><span>Sem código interno</span><strong>{diag.semCode}</strong></div>
              <div className="flex justify-between p-2 rounded bg-muted/40"><span>Sem imagem</span><strong>{diag.semImagem}</strong></div>
              <p className="text-xs text-muted-foreground pt-2">
                Índices de busca (trigramas) ativos em nome, SKU, código, marca, categoria e descrição.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <LogisticsImportDialog
        open={logisticsImportOpen}
        onOpenChange={setLogisticsImportOpen}
        onImported={loadProducts}
      />
    </AppLayout>
  );
}
