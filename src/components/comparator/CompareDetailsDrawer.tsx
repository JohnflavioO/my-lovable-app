import { useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Download, ExternalLink, AlertCircle, Info, RefreshCw } from 'lucide-react';
import { useDetailedComparison, type DetailedComparison, type Verdict } from '@/hooks/useDetailedComparison';
import { generateComparisonPdf } from '@/lib/generateComparisonPdf';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mciProductId: string;
  external: { input?: string; brand?: string; model?: string; category?: string; url?: string };
}

const verdictMeta: Record<Verdict, { label: string; className: string }> = {
  igual: { label: 'Igual', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  proximo: { label: 'Próximo', className: 'bg-lime-100 text-lime-800 border-lime-200' },
  mci_superior: { label: 'MCI superior', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  pesquisado_superior: { label: 'Externo superior', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  nao_comparavel: { label: 'Não comparável', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  indisponivel: { label: 'Sem dado', className: 'bg-muted text-muted-foreground border-border' },
};

const confidenceMeta: Record<string, string> = {
  alta: 'text-emerald-600',
  'média': 'text-amber-600',
  baixa: 'text-rose-600',
  desconhecida: 'text-muted-foreground',
};

const sourceLabel: Record<string, string> = {
  url: 'via URL',
  estimativa_agente: 'estimativa do agente',
  texto_usuario: 'informado pelo usuário',
  catalogo_mci: 'catálogo MCI',
};

const currency = (v?: number | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function CellBlock({ cell }: { cell: { value: string; source?: string; confidence?: string } }) {
  const val = cell?.value?.trim();
  return (
    <div className="space-y-1">
      <p className={`text-sm ${val ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        {val || 'Não informado'}
      </p>
      {(cell?.source || cell?.confidence) && (
        <div className="flex flex-wrap gap-1 text-[10px]">
          {cell.source && (
            <span className="text-muted-foreground">{sourceLabel[cell.source] ?? cell.source}</span>
          )}
          {cell.confidence && (
            <span className={confidenceMeta[cell.confidence] ?? 'text-muted-foreground'}>
              • confiança {cell.confidence}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompareDetailsDrawer({ open, onOpenChange, mciProductId, external }: Props) {
  const compare = useDetailedComparison();

  useEffect(() => {
    if (open && mciProductId) {
      compare.mutate({ mci_product_id: mciProductId, external });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mciProductId]);

  const data: DetailedComparison | undefined = compare.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader className="pb-3 border-b">
          <SheetTitle className="flex items-center justify-between gap-3">
            <span>Comparativo técnico detalhado</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={compare.isPending} onClick={() => compare.mutate({ mci_product_id: mciProductId, external })}>
                <RefreshCw className={`h-4 w-4 mr-1 ${compare.isPending ? 'animate-spin' : ''}`} /> Recalcular
              </Button>
              <Button size="sm" variant="outline" disabled={!data} onClick={() => { try { generateComparisonPdf(data!); } catch (e: any) { toast.error('Falha ao gerar PDF: ' + e?.message); } }}>
                <Download className="h-4 w-4 mr-1" /> Exportar PDF
              </Button>
            </div>
          </SheetTitle>
        </SheetHeader>

        {compare.isPending && (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Analisando especificações e cruzando com o catálogo...</p>
            <div className="w-full max-w-md space-y-2 pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        )}

        {compare.isError && (
          <div className="py-10 text-sm text-rose-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <p className="font-medium">Não foi possível gerar o comparativo.</p>
              <p className="text-muted-foreground">{(compare.error as any)?.message}</p>
            </div>
          </div>
        )}

        {data && (
          <div className="mt-4 space-y-6 pb-10">
            {/* Header cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Produto pesquisado</p>
                <div className="flex gap-3">
                  {data.left?.image ? (
                    <img src={data.left.image} alt="" className="w-20 h-20 object-contain rounded bg-white border" />
                  ) : (
                    <div className="w-20 h-20 rounded bg-background border" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{data.left?.brand || '—'}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{data.left?.model || external.input}</p>
                    {data.left?.url && (
                      <a href={data.left.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                        <ExternalLink className="h-3 w-3" /> abrir origem
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-primary/5">
                <p className="text-[10px] uppercase tracking-wider text-primary mb-2">Equivalente no catálogo MCI</p>
                <div className="flex gap-3">
                  {data.right?.image ? (
                    <img src={data.right.image} alt="" className="w-20 h-20 object-contain rounded bg-white border" />
                  ) : (
                    <div className="w-20 h-20 rounded bg-background border" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{data.right?.brand || '—'}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{data.right?.model}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[data.right?.sku && `SKU ${data.right.sku}`, data.right?.code, currency(data.right?.price)].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Score + summary */}
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Compatibilidade global</p>
                  <p className="text-2xl font-bold">{data.compatibility ?? 0}%</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.tier && <Badge variant="secondary">{data.tier.replace(/_/g, ' ')}</Badge>}
                  {data.confidenceOverall && (
                    <Badge className={confidenceMeta[data.confidenceOverall] + ' bg-background border'}>
                      Confiança {data.confidenceOverall}
                    </Badge>
                  )}
                </div>
              </div>
              {data.summary && <p className="text-sm text-muted-foreground mt-3">{data.summary}</p>}
            </div>

            {/* Rows */}
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-12 bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">
                <div className="col-span-3">Atributo</div>
                <div className="col-span-4">Pesquisado</div>
                <div className="col-span-4">MCI</div>
                <div className="col-span-1 text-right">Veredito</div>
              </div>
              <div className="divide-y">
                {(data.rows ?? []).map((r) => (
                  <div key={r.key} className="grid grid-cols-12 gap-3 px-3 py-3 items-start hover:bg-muted/20">
                    <div className="col-span-3 text-sm font-medium">{r.label}</div>
                    <div className="col-span-4"><CellBlock cell={r.left} /></div>
                    <div className="col-span-4"><CellBlock cell={r.right} /></div>
                    <div className="col-span-1 flex justify-end">
                      <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${verdictMeta[r.verdict]?.className ?? ''}`}>
                        {verdictMeta[r.verdict]?.label ?? r.verdict}
                      </Badge>
                    </div>
                  </div>
                ))}
                {(!data.rows || data.rows.length === 0) && (
                  <div className="p-6 text-sm text-muted-foreground text-center">Sem atributos comparáveis retornados.</div>
                )}
              </div>
            </div>

            {/* Lists */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['similarities', 'mciAdvantages', 'attentionPoints'] as const).map((k) => {
                const title = k === 'similarities' ? 'Semelhanças' : k === 'mciAdvantages' ? 'Vantagens do MCI' : 'Pontos de atenção';
                const color = k === 'similarities' ? 'text-emerald-600' : k === 'mciAdvantages' ? 'text-primary' : 'text-amber-600';
                const items = (data as any)[k] as string[] | undefined;
                if (!items?.length) return null;
                return (
                  <div key={k} className="rounded-lg border p-3">
                    <p className={`text-xs font-semibold mb-2 ${color}`}>{title}</p>
                    <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                      {items.map((it, i) => <li key={i}>{it}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>

            {data.conclusion && (
              <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
                <p className="text-xs font-semibold text-primary mb-1">Conclusão do agente</p>
                <p className="text-sm">{data.conclusion}</p>
              </div>
            )}

            {data.scoring?.breakdown?.length ? (
              <div className="rounded-lg border p-4">
                <p className="text-xs font-semibold mb-3 flex items-center gap-1">
                  <Info className="h-3 w-3" /> Como chegamos nesta pontuação
                </p>
                <div className="space-y-2">
                  {data.scoring.breakdown.map((b, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="font-medium">{b.attribute} <span className="text-muted-foreground">({b.weight}% do total)</span></span>
                        <span className="font-semibold">{b.score}/100</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${b.score}%` }} />
                      </div>
                      {b.note && <p className="text-muted-foreground mt-1">{b.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="text-[10px] text-muted-foreground text-center pt-2">
              Dados do MCI vêm exclusivamente do catálogo cadastrado. Especificações do produto pesquisado que não são fatuais estão marcadas como "estimativa" — valide antes de apresentar ao cliente.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
