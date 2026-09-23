import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Loader2, Search, FileText, PlusCircle, User, ChevronLeft, CheckCircle2, AlertTriangle, ExternalLink, ArrowRight, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ComparatorProduct } from '@/hooks/useEquivalentSearch';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: ComparatorProduct | null;
  compatibility?: number;
  searchInput?: string;
  externalBrand?: string;
  externalModel?: string;
}

const db = supabase as any;

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-slate-500' },
  pre_sale: { label: 'Pré-venda', className: 'bg-indigo-500' },
  pre_venda: { label: 'Pré-venda', className: 'bg-indigo-500' },
  contact_made: { label: 'Contato feito', className: 'bg-cyan-600' },
  contato_feito: { label: 'Contato feito', className: 'bg-cyan-600' },
  sent: { label: 'Proposta enviada', className: 'bg-blue-600' },
  negotiation: { label: 'Em negociação', className: 'bg-amber-600' },
  negociacao: { label: 'Em negociação', className: 'bg-amber-600' },
  approved: { label: 'Aprovado', className: 'bg-emerald-600' },
  rejected: { label: 'Rejeitado', className: 'bg-rose-600' },
};

const currency = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const useDebounced = <T,>(value: T, ms = 350) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

type Step = 'browse' | 'preview' | 'success';

const PAGE_SIZE = 20;

export default function AddToQuoteDialog({
  open, onOpenChange, product, compatibility, searchInput, externalBrand, externalModel,
}: Props) {
  const { user, isGestor } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [step, setStep] = useState<Step>('browse');

  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number>(product?.price ?? 0);
  const [notes, setNotes] = useState('');

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 350);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null);

  const [clientSearch, setClientSearch] = useState('');
  const debouncedClient = useDebounced(clientSearch, 350);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [initialStatus] = useState<'draft'>('draft');

  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [savedQuoteNumber, setSavedQuoteNumber] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('existing');
      setStep('browse');
      setSearch('');
      setStatusFilter('all');
      setPage(0);
      setSelectedQuote(null);
      setSelectedClient(null);
      setClientSearch('');
      setQty(1);
      setUnitPrice(product?.price ?? 0);
      setNotes('');
      setSavedQuoteId(null);
      setSavedQuoteNumber(null);
    }
  }, [open, product]);

  const activeStatuses = ['draft', 'sent', 'pre_sale', 'pre_venda', 'contact_made', 'contato_feito', 'negotiation', 'negociacao'];

  const quotesQ = useQuery({
    queryKey: ['comparator_quotes', user?.id, isGestor, debounced, statusFilter, page],
    enabled: open && tab === 'existing' && !!user?.id,
    staleTime: 15_000,
    queryFn: async () => {
      let q = db
        .from('quotes')
        .select('id, quote_number, client_name, status, total_amount, total, updated_at, created_at, created_by', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (!isGestor && user?.id) q = q.eq('created_by', user.id);

      if (statusFilter === 'all') q = q.in('status', activeStatuses);
      else if (statusFilter === 'recent') { /* no filter */ }
      else q = q.eq('status', statusFilter);

      if (debounced.trim()) {
        const term = `%${debounced.trim()}%`;
        q = q.or(`quote_number.ilike.${term},client_name.ilike.${term}`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const clientsQ = useQuery({
    queryKey: ['comparator_clients', user?.id, debouncedClient],
    enabled: open && tab === 'new' && !!user?.id,
    staleTime: 15_000,
    queryFn: async () => {
      let q = db
        .from('clients')
        .select('id, name, company_name, cpf_cnpj, email, city, state, phone')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (debouncedClient.trim()) {
        const t = `%${debouncedClient.trim()}%`;
        q = q.or(`name.ilike.${t},company_name.ilike.${t},cpf_cnpj.ilike.${t},email.ilike.${t},city.ilike.${t}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const productActive = !!product;
  const subtotal = qty * (unitPrice || 0);

  const productSpecs = useMemo(() => {
    const parts: string[] = ['Origem: Comparador Inteligente'];
    if (typeof compatibility === 'number') parts.push(`Compatibilidade: ${compatibility.toFixed(0)}%`);
    if (searchInput) parts.push(`Pesquisa: "${searchInput}"`);
    if (externalBrand || externalModel) parts.push(`Externo: ${externalBrand ?? ''} ${externalModel ?? ''}`.trim());
    return parts.join(' • ');
  }, [compatibility, searchInput, externalBrand, externalModel]);

  const insertItem = async (quoteId: string) => {
    const { error } = await db.from('quote_items').insert({
      quote_id: quoteId,
      description: product!.name,
      brand: product!.brand ?? '',
      code: product!.code ?? '',
      product_code: product!.code ?? product!.sku ?? '',
      category: product!.category_principal ?? 'audio',
      image_url: product!.image_url ?? null,
      quantity: qty,
      unit_price: unitPrice,
      total_price: subtotal,
      unit_total: unitPrice,
      line_total: subtotal,
      specifications: productSpecs,
    });
    if (error) throw error;
  };

  const handleConfirmExisting = async () => {
    if (!product || !selectedQuote || saving) return;
    setSaving(true);
    try {
      await insertItem(selectedQuote.id);
      setSavedQuoteId(selectedQuote.id);
      setSavedQuoteNumber(selectedQuote.quote_number);
      setStep('success');
      qc.invalidateQueries({ queryKey: ['comparator_quotes'] });
      toast.success('Produto adicionado ao orçamento');
    } catch (e: any) {
      toast.error('Falha ao adicionar: ' + (e?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!product || !selectedClient || !user?.id || saving) return;
    setSaving(true);
    try {
      const clientDisplay = selectedClient.company_name || selectedClient.name || 'Cliente';
      const { data: qData, error: qErr } = await db
        .from('quotes')
        .insert({
          client_id: selectedClient.id,
          client_name: clientDisplay,
          status: initialStatus,
          created_by: user.id,
          salesperson_id: user.id,
          total_amount: subtotal,
          total: subtotal,
          notes: notes ? `${notes}\n\n[Origem: Comparador Inteligente]` : '[Origem: Comparador Inteligente]',
        })
        .select('id, quote_number')
        .single();
      if (qErr) throw qErr;

      await insertItem(qData.id);

      setSavedQuoteId(qData.id);
      setSavedQuoteNumber(qData.quote_number);
      setStep('success');
      qc.invalidateQueries({ queryKey: ['comparator_quotes'] });
      toast.success(`Orçamento ${qData.quote_number} criado com sucesso`);
    } catch (e: any) {
      toast.error('Falha ao criar orçamento: ' + (e?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  };

  const goToQuote = () => {
    if (!savedQuoteId) return;
    onOpenChange(false);
    navigate(`/quotes?open=${savedQuoteId}`);
  };

  const continueComparing = () => onOpenChange(false);

  const addAnother = () => {
    setStep('browse');
    setSelectedQuote(null);
    setSelectedClient(null);
    setQty(1);
    setUnitPrice(product?.price ?? 0);
    setNotes('');
  };

  // ============= Sections =============

  const ProductHeader = () => product && (
    <div className="flex gap-3 items-start border rounded-lg p-3 bg-muted/40">
      {product.image_url ? (
        <img src={product.image_url} alt="" className="w-14 h-14 shrink-0 object-contain rounded bg-background" />
      ) : (
        <div className="w-14 h-14 shrink-0 rounded bg-background flex items-center justify-center text-xs text-muted-foreground">MCI</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold line-clamp-2 leading-snug">{product.name}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {product.brand ?? '—'} {product.code ? `• ${product.code}` : ''} {product.category_principal ? `• ${product.category_principal}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold whitespace-nowrap">{currency(product.price ?? 0)}</p>
        {typeof compatibility === 'number' && (
          <Badge variant="secondary" className="mt-1">{compatibility.toFixed(0)}% match</Badge>
        )}
      </div>
    </div>
  );

  const renderBrowseExisting = () => (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar por número do orçamento ou cliente..."
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          { v: 'all', label: 'Em aberto' },
          { v: 'negotiation', label: 'Em negociação' },
          { v: 'sent', label: 'Proposta enviada' },
          { v: 'draft', label: 'Rascunho' },
          { v: 'pre_sale', label: 'Pré-venda' },
          { v: 'recent', label: 'Recentes' },
        ].map((f) => (
          <Button
            key={f.v}
            type="button"
            size="sm"
            variant={statusFilter === f.v ? 'default' : 'outline'}
            onClick={() => { setStatusFilter(f.v); setPage(0); }}
            className="h-7 px-3 text-xs"
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {quotesQ.isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
          </div>
        ) : (quotesQ.data?.rows ?? []).length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Nenhum orçamento encontrado na sua carteira.
          </div>
        ) : (
          quotesQ.data!.rows.map((q: any) => {
            const meta = STATUS_META[q.status] ?? { label: q.status, className: 'bg-slate-500' };
            const value = Number(q.total_amount ?? q.total ?? 0);
            return (
              <Card key={q.id} className="p-3 hover:border-primary/60 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{q.quote_number}</span>
                      <Badge className={`${meta.className} text-white text-[10px] px-1.5 py-0`}>{meta.label}</Badge>
                    </div>
                    <p className="text-sm mt-0.5 truncate">{q.client_name || 'Sem cliente'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {currency(value)} • {formatDistanceToNow(new Date(q.updated_at || q.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => { setSelectedQuote(q); setStep('preview'); }} className="shrink-0">
                    Selecionar <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-2 border-t">
        <span>{quotesQ.data?.count ?? 0} orçamento(s)</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <Button size="sm" variant="outline"
            disabled={((page + 1) * PAGE_SIZE) >= (quotesQ.data?.count ?? 0)}
            onClick={() => setPage((p) => p + 1)}>Próximo</Button>
        </div>
      </div>
    </div>
  );

  const renderBrowseNew = () => (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Buscar cliente por nome, CNPJ, e-mail ou cidade..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => { onOpenChange(false); navigate('/clients?new=1'); }} className="shrink-0">
          <PlusCircle className="h-4 w-4 mr-1" /> Cadastrar
        </Button>
      </div>

      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
        {clientsQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
          </div>
        ) : (clientsQ.data ?? []).length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum cliente da sua carteira encontrado.
          </div>
        ) : (
          clientsQ.data!.map((c: any) => {
            const selected = selectedClient?.id === c.id;
            return (
              <Card
                key={c.id}
                className={`p-3 cursor-pointer transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:border-primary/60'}`}
                onClick={() => setSelectedClient(c)}
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{c.company_name || c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[c.cpf_cnpj, c.email, [c.city, c.state].filter(Boolean).join('/')].filter(Boolean).join(' • ') || '—'}
                    </p>
                  </div>
                  {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </div>
              </Card>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t">
        <div>
          <Label className="text-xs">Quantidade</Label>
          <Input type="number" min={1} value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <Label className="text-xs">Preço unitário (R$)</Label>
          <Input type="number" min={0} step="0.01" value={unitPrice}
            onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value) || 0))} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Observação (opcional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas internas do orçamento..." />
      </div>
      <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 text-sm">
        <span className="text-muted-foreground">Subtotal • Status inicial: <b>Rascunho</b></span>
        <span className="font-semibold">{currency(subtotal)}</span>
      </div>
    </div>
  );

  const renderPreview = () => selectedQuote && product && (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 p-4 rounded-lg border bg-muted/30 text-sm">
        <div><span className="text-muted-foreground">Orçamento:</span><br /><b>{selectedQuote.quote_number}</b></div>
        <div><span className="text-muted-foreground">Cliente:</span><br /><b className="truncate block">{selectedQuote.client_name}</b></div>
        <div className="col-span-2"><span className="text-muted-foreground">Produto:</span><br /><b>{product.name}</b></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Quantidade</Label>
          <Input type="number" min={1} value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <Label className="text-xs">Preço unitário (R$)</Label>
          <Input type="number" min={0} step="0.01" value={unitPrice}
            onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value) || 0))} />
        </div>
      </div>
      <div className="flex items-center justify-between p-3 rounded-md bg-primary/5 border border-primary/30 text-sm">
        <span className="text-muted-foreground">Subtotal desta linha</span>
        <span className="font-bold text-lg">{currency(subtotal)}</span>
      </div>
      {!productActive && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Produto indisponível — confirme com administrador antes de adicionar.
        </div>
      )}
    </div>
  );

  const renderSuccess = () => (
    <div className="space-y-5 text-center py-6">
      <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <div>
        <p className="font-semibold">
          {tab === 'new' ? `Orçamento ${savedQuoteNumber} criado com sucesso.` : 'Produto adicionado ao orçamento com sucesso.'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {product?.name} • {qty}× {currency(unitPrice)} = <b>{currency(subtotal)}</b>
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={goToQuote}><ExternalLink className="h-4 w-4 mr-1" /> Abrir orçamento</Button>
        <Button variant="outline" onClick={addAnother}>Adicionar outro produto</Button>
        <Button variant="ghost" onClick={continueComparing}>Continuar comparando</Button>
      </div>
    </div>
  );

  // ============= Footer per state =============
  const renderFooter = () => {
    if (step === 'success') return null;
    if (step === 'preview' && tab === 'existing') {
      return (
        <>
          <Button variant="ghost" onClick={() => setStep('browse')} className="mr-auto">
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirmExisting} disabled={saving || !productActive}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar adição
          </Button>
        </>
      );
    }
    if (tab === 'new') {
      return (
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreateNew} disabled={saving || !selectedClient || !productActive}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar orçamento
          </Button>
        </>
      );
    }
    return <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>;
  };

  const contentClass = cn(
    'fixed z-50 bg-background shadow-lg border flex flex-col overflow-hidden',
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    isMobile
      ? 'inset-0 w-full h-[100dvh] rounded-none'
      : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-[760px] max-h-[88vh] rounded-lg',
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className={contentClass} aria-describedby="add-to-quote-desc">
          {/* Header */}
          <div className="shrink-0 border-b px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-semibold">Adicionar ao orçamento</DialogPrimitive.Title>
                <DialogPrimitive.Description id="add-to-quote-desc" className="text-xs text-muted-foreground mt-0.5">
                  Selecione um orçamento existente da sua carteira ou crie um novo já com este produto.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring shrink-0">
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar</span>
              </DialogPrimitive.Close>
            </div>
            <div className="mt-3">
              <ProductHeader />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {step === 'success' ? renderSuccess() : (
              <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setStep('browse'); }}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="existing"><FileText className="h-4 w-4 mr-1" /> Orçamento existente</TabsTrigger>
                  <TabsTrigger value="new"><PlusCircle className="h-4 w-4 mr-1" /> Novo orçamento</TabsTrigger>
                </TabsList>
                <TabsContent value="existing" className="mt-4">
                  {step === 'preview' ? renderPreview() : renderBrowseExisting()}
                </TabsContent>
                <TabsContent value="new" className="mt-4">
                  {renderBrowseNew()}
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Footer */}
          {step !== 'success' && (
            <div className="shrink-0 border-t px-5 py-3 flex items-center justify-end gap-2 bg-background">
              {renderFooter()}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
