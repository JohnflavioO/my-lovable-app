import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  X, FileText, User, Phone, Mail, Calendar, DollarSign, CreditCard,
  QrCode, FileBarChart, Truck, Package, ExternalLink, Copy, MessageSquare,
  CheckCircle2, Clock, CircleDot, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';

const db = supabase as any;

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatDate = (v?: string | null) => {
  if (!v) return '—';
  try {
    return new Date(v.includes('T') ? v : `${v}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};

const statusMap: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  pre_venda: { label: 'Pré-venda', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  sent: { label: 'Enviado', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  negociacao: { label: 'Negociação', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Rejeitado', className: 'bg-red-100 text-red-800 border-red-200' },
};

const paymentStatusMap: Record<string, { label: string; icon: any; className: string }> = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  em_andamento: { label: 'Em andamento', icon: CircleDot, className: 'bg-blue-100 text-blue-800 border-blue-200' },
  liquidado: { label: 'Liquidado', icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  faturado: { label: 'Faturado', icon: CheckCircle2, className: 'bg-purple-100 text-purple-800 border-purple-200' },
};

const paymentMethodMap: Record<string, { label: string; icon: any }> = {
  pix: { label: 'PIX', icon: QrCode },
  cartao: { label: 'Cartão', icon: CreditCard },
  boleto: { label: 'Boleto', icon: FileBarChart },
  parceria: { label: 'Parceria', icon: FileBarChart },
};

interface Props {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function QuoteQuickViewModal({ quoteId, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !quoteId) return;
      setLoading(true);
      setQuote(null);
      setItems([]);
      const { data: q } = await db
        .from('quotes')
        .select('*, clients(company_name, phone, email)')
        .eq('id', quoteId)
        .maybeSingle();
      const { data: it } = await db
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId);
      if (!cancelled) {
        setQuote(q);
        setItems(it || []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, quoteId]);

  const publicUrl = quote?.public_token
    ? `${window.location.origin}/quote/${quote.public_token}`
    : '';

  const status = statusMap[quote?.status] || { label: quote?.status || '—', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  const pStatus = paymentStatusMap[quote?.payment_status] || paymentStatusMap.pendente;
  const pMethod = paymentMethodMap[quote?.payment_method];
  const PsIcon = pStatus.icon;

  const total = Number(quote?.total_amount) || 0;
  const shipping = Number(quote?.shipping_cost) || 0;
  const discount = Number(quote?.discount) || 0;
  const subtotal = items.reduce(
    (s: number, i: any) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0),
    0,
  );

  const clientLabel = quote?.clients?.company_name || quote?.client_name || 'Sem cliente';
  const clientPhone = quote?.clients?.phone || quote?.client_phone;
  const clientEmail = quote?.clients?.email || quote?.client_email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        {loading || !quote ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Carregando orçamento…</div>
        ) : (
          <>
            {/* Header */}
            <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 py-5">
              <button
                onClick={() => onOpenChange(false)}
                className="absolute top-4 right-4 rounded-md p-1.5 hover:bg-background/60 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold font-display text-primary">
                      {quote.quote_number || '—'}
                    </h2>
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${pStatus.className}`}>
                      <PsIcon className="h-3 w-3" /> {pStatus.label}
                    </span>
                  </div>
                  <p className="text-sm text-foreground mt-0.5 font-medium truncate">{clientLabel}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Criado em {formatDate(quote.quote_date || quote.created_at)}
                    {quote.followup_date && <> · Follow-up: {formatDate(quote.followup_date)}</>}
                  </p>
                </div>
              </div>

              {/* Value strip */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-background/70 backdrop-blur px-3 py-2 border">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="text-base font-bold text-primary">{formatCurrency(total)}</p>
                </div>
                <div className="rounded-lg bg-background/70 backdrop-blur px-3 py-2 border">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Frete</p>
                  <p className="text-sm font-semibold">{formatCurrency(shipping)}</p>
                </div>
                <div className="rounded-lg bg-background/70 backdrop-blur px-3 py-2 border">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Desconto</p>
                  <p className="text-sm font-semibold">{formatCurrency(discount)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Client & payment */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Cliente
                  </div>
                  <p className="font-medium text-sm">{clientLabel}</p>
                  {clientPhone && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> {clientPhone}
                    </p>
                  )}
                  {clientEmail && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Mail className="h-3 w-3" /> {clientEmail}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Pagamento
                  </div>
                  {pMethod ? (
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      <pMethod.icon className="h-3.5 w-3.5 text-muted-foreground" /> {pMethod.label}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Não informado</p>
                  )}
                  {quote.payment_terms && (
                    <p className="text-xs text-muted-foreground mt-1">Condições: {quote.payment_terms}</p>
                  )}
                  {quote.installments && (
                    <p className="text-xs text-muted-foreground mt-0.5">Parcelas: {quote.installments}x</p>
                  )}
                </div>
              </div>

              {/* Shipping */}
              {(quote.shipping_type || quote.shipping_address || quote.tracking_code) && (
                <div className="rounded-lg border p-4">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" /> Logística
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2 text-xs">
                    {quote.shipping_type && <div><span className="text-muted-foreground">Tipo: </span><span className="font-medium">{quote.shipping_type}</span></div>}
                    {quote.tracking_code && <div><span className="text-muted-foreground">Rastreio: </span><span className="font-mono font-medium">{quote.tracking_code}</span></div>}
                    {quote.shipping_address && <div className="sm:col-span-3"><span className="text-muted-foreground">Endereço: </span><span className="font-medium">{quote.shipping_address}</span></div>}
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Itens ({items.length})
                </div>
                {items.length === 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground italic text-center">
                    Nenhum item cadastrado
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left text-[11px] uppercase text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Produto</th>
                          <th className="px-3 py-2 font-medium text-right w-16">Qtd</th>
                          <th className="px-3 py-2 font-medium text-right w-28">Unit.</th>
                          <th className="px-3 py-2 font-medium text-right w-28">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((it, idx) => {
                          const line = (Number(it.unit_price) || 0) * (Number(it.quantity) || 0);
                          return (
                            <tr key={it.id || idx} className="hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <p className="font-medium truncate">{it.product_name || it.description || 'Item'}</p>
                                {it.sku && <p className="text-[10px] text-muted-foreground">{it.sku}</p>}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(Number(it.unit_price) || 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(line)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/30 text-xs">
                        <tr>
                          <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">Subtotal itens</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(subtotal)}</td>
                        </tr>
                        {shipping > 0 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">Frete</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(shipping)}</td>
                          </tr>
                        )}
                        {discount > 0 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">Desconto</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-red-600">- {formatCurrency(discount)}</td>
                          </tr>
                        )}
                        <tr className="border-t">
                          <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-primary">{formatCurrency(total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes */}
              {quote.notes && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" /> Observações
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap">
                    {quote.notes}
                  </div>
                </div>
              )}

              {/* Public link */}
              {publicUrl && (
                <div className="rounded-lg border bg-accent/5 p-3">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Link público
                  </div>
                  <div className="flex gap-2">
                    <input readOnly value={publicUrl} className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs font-mono" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Link copiado'); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(publicUrl, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 bg-muted/30">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button
                size="sm"
                onClick={() => { onOpenChange(false); navigate('/quotes'); }}
                className="gap-1.5"
              >
                Ver na lista completa <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
