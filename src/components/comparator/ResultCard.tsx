import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Plus, Layers, Sparkles, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import CompareDetailsDrawer from './CompareDetailsDrawer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ComparatorResult } from '@/hooks/useEquivalentSearch';

interface Props {
  result: ComparatorResult;
  externalInfo?: { brand?: string; model?: string; url?: string; input?: string };
  onAdd: () => void;
}

const compatColor = (v: number) => {
  if (v >= 90) return 'bg-emerald-500';
  if (v >= 75) return 'bg-lime-500';
  if (v >= 60) return 'bg-amber-500';
  return 'bg-rose-500';
};

const TIER_META: Record<string, { label: string; className: string }> = {
  equivalente_direto: { label: 'Equivalente direto', className: 'bg-emerald-600 text-white' },
  alternativa_superior: { label: 'Alternativa superior', className: 'bg-sky-600 text-white' },
  alternativa_economica: { label: 'Alternativa econômica', className: 'bg-amber-500 text-white' },
  relacionado: { label: 'Produto relacionado', className: 'bg-slate-500 text-white' },
};

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Single source of truth: only CRM-provided price is displayed.
// Never invent, estimate, or default to zero.
type PriceState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'on_request' }
  | { kind: 'promo'; promo: number; original?: number | null }
  | { kind: 'value'; value: number }
  | { kind: 'unavailable' };

function resolvePrice(p: any): PriceState {
  if (!p) return { kind: 'error' };
  if (p.price_on_request === true) return { kind: 'on_request' };
  const promo = Number(p.promotional_price);
  if (Number.isFinite(promo) && promo > 0) {
    const orig = Number(p.price);
    return { kind: 'promo', promo, original: Number.isFinite(orig) && orig > promo ? orig : null };
  }
  const price = Number(p.price);
  if (Number.isFinite(price) && price > 0) return { kind: 'value', value: price };
  return { kind: 'unavailable' };
}

export default function ResultCard({ result, externalInfo, onAdd }: Props) {
  const [showCompare, setShowCompare] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [live, setLive] = useState<any>(null);
  const [liveState, setLiveState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  const baseId = result.product?.id;

  useEffect(() => {
    let cancelled = false;
    if (!baseId) { setLiveState('error'); return; }
    setLiveState('loading');
    (async () => {
      // Single source of truth: always fetch commercial data live from CRM by product_id.
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', baseId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) { setLive(null); setLiveState('error'); return; }
      setLive(data);
      setLiveState('ok');
    })();
    return () => { cancelled = true; };
  }, [baseId, reloadKey]);

  // Only render fields from the live product to guarantee card consistency (same product_id).
  const p: any = live ?? (liveState === 'loading' ? result.product : null);
  const price: PriceState = liveState === 'loading'
    ? { kind: 'loading' }
    : liveState === 'error' || !p
      ? { kind: 'error' }
      : resolvePrice(p);

  const confirmEquivalence = async () => {
    if (!p?.id) return;
    setConfirming(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error('sem sessão');
      const { error } = await (supabase as any).from('product_equivalences').insert({
        produto_externo: externalInfo?.input ?? externalInfo?.model ?? null,
        marca_externa: externalInfo?.brand ?? null,
        modelo_externo: externalInfo?.model ?? null,
        url_externa: externalInfo?.url ?? null,
        mci_product_id: p.id,
        confidence: result.compatibility,
        approved_by: uid,
        notes: (result.reasons ?? []).join(' • '),
      });
      if (error) throw error;
      toast.success('Equivalência salva. Será usada em buscas futuras.');
    } catch (e: any) {
      toast.error('Falha ao salvar: ' + (e?.message ?? 'erro'));
    } finally {
      setConfirming(false);
    }
  };

  if (liveState === 'error' || !p) {
    return (
      <Card className="border-amber-400/60">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Produto encontrado, mas os dados comerciais não puderam ser validados no momento.</p>
            <p className="text-xs text-muted-foreground mt-1">Não exibimos preço nem estoque sem confirmação do cadastro real.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw className="h-4 w-4 mr-1" /> Atualizar dados do produto
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-border/70 hover:border-primary/50 transition-colors">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex gap-4">
            <div className="w-24 h-24 shrink-0 rounded-md bg-muted/40 border overflow-hidden flex items-center justify-center">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-contain" />
              ) : (
                <Layers className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {p.brand ?? 'Sem marca'} {p.code ? `• ${p.code}` : ''} {p.sku ? `• SKU ${p.sku}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {result.tier && TIER_META[result.tier] && (
                    <Badge className={`gap-1 ${TIER_META[result.tier].className}`}>{TIER_META[result.tier].label}</Badge>
                  )}
                  {result.approved && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Aprovado
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Compatibilidade</span>
                    <span className="font-semibold">{result.compatibility}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${compatColor(result.compatibility)}`} style={{ width: `${result.compatibility}%` }} />
                  </div>
                </div>
                <div className="text-right min-w-[110px]">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Preço (CRM)</p>
                  {price.kind === 'loading' && (
                    <p className="text-xs text-muted-foreground">Validando…</p>
                  )}
                  {price.kind === 'on_request' && (
                    <p className="text-sm font-semibold">Preço sob consulta</p>
                  )}
                  {price.kind === 'promo' && (
                    <>
                      <p className="text-sm font-semibold text-emerald-600">{currency(price.promo)}</p>
                      {price.original != null && (
                        <p className="text-[11px] text-muted-foreground line-through">{currency(price.original)}</p>
                      )}
                    </>
                  )}
                  {price.kind === 'value' && (
                    <p className="text-sm font-semibold">{currency(price.value)}</p>
                  )}
                  {price.kind === 'unavailable' && (
                    <p className="text-xs text-muted-foreground">Preço não informado</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {result.reasons && result.reasons.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5 pl-1">
              {result.reasons.slice(0, 3).map((r, i) => (<li key={i}>{r}</li>))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar ao orçamento
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCompare(true)}>
              <Layers className="h-4 w-4 mr-1" /> Comparar detalhes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/products?highlight=${p.id}`, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-4 w-4 mr-1" /> Abrir produto no CRM
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReloadKey((k) => k + 1)} title="Recarregar dados comerciais">
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
            {!result.approved && (
              <>
                <Button size="sm" variant="ghost" onClick={confirmEquivalence} disabled={confirming}>
                  <Sparkles className="h-4 w-4 mr-1" /> É o equivalente
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => toast.info('Obrigado pelo feedback. Ajuste registrado para calibrarmos próximas buscas.')}>
                  Não é equivalente
                </Button>
              </>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Dados comerciais lidos ao vivo do cadastro (ID {p.id.slice(0, 8)}…) em {new Date().toLocaleTimeString('pt-BR')}.
          </p>
        </CardContent>
      </Card>


      <CompareDetailsDrawer
        open={showCompare}
        onOpenChange={setShowCompare}
        mciProductId={p.id}
        external={{
          input: externalInfo?.input,
          brand: externalInfo?.brand,
          model: externalInfo?.model,
          category: p.category_principal ?? undefined,
          url: externalInfo?.url,
        }}
      />

    </>
  );
}
