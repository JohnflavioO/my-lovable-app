import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { CheckCircle, XCircle, Loader2, User, Calendar, Truck, FileText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function PublicQuote() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [dialogAction, setDialogAction] = useState<'approved' | 'rejected' | null>(null);
  const [approverName, setApproverName] = useState('');

  const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { 'x-quote-token': token || '' } },
  });

  useEffect(() => {
    const load = async () => {
      if (!token) { setError('Token inválido'); setLoading(false); return; }
      const { data: q, error: qErr } = await anonClient.from('quotes').select('*').eq('public_token', token).single();
      if (qErr || !q) { setError('Orçamento não encontrado'); setLoading(false); return; }
      setQuote(q);
      if (q.client_name) setApproverName(q.client_name);
      const { data: it } = await anonClient.from('quote_items').select('*').eq('quote_id', q.id).order('item_number');
      setItems(it || []);
      setLoading(false);
    };
    load();
  }, [token]);

  const confirmAction = async () => {
    if (!quote || !dialogAction) return;
    const name = approverName.trim();
    if (!name) { toast.error('Informe seu nome para confirmar.'); return; }
    setActing(true);
    const { error } = await anonClient.rpc('public_quote_action', {
      p_token: token,
      p_action: dialogAction,
      p_approver_name: name,
    });
    if (error) { toast.error('Erro ao processar. Tente novamente.'); setActing(false); return; }
    const nowIso = new Date().toISOString();
    const updates: any = {
      status: dialogAction,
      approver_name: name,
      ...(dialogAction === 'approved' ? { approved_at: nowIso } : { rejected_at: nowIso }),
    };
    setQuote((prev: any) => ({ ...prev, ...updates }));
    toast.success(dialogAction === 'approved' ? 'Orçamento aprovado com sucesso!' : 'Orçamento rejeitado.');
    setActing(false);
    setDialogAction(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
        <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Oops!</h2>
        <p className="text-muted-foreground">{error}</p>
      </CardContent></Card>
    </div>
  );

  const alreadyActed = quote.status === 'approved' || quote.status === 'rejected';
  const isApproved = quote.status === 'approved';
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.line_total) || 0), 0);
  const shipping = parseFloat(quote.shipping_cost) || 0;
  const total = parseFloat(quote.total_amount) || 0;
  const actedAt = quote.approved_at || quote.rejected_at;

  return (
    <div className="min-h-screen bg-muted/30 pb-24 md:pb-8">
      <Sonner />

      {/* Header */}
      <header className="bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <img src="/mci-logo.png" alt="MCI Store" className="h-9 md:h-10" />
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Orçamento</p>
            <p className="font-bold font-display text-base md:text-lg">{quote.quote_number}</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Status hero */}
        {alreadyActed ? (
          <Card className={`border-2 ${isApproved ? 'border-emerald-500/40 bg-emerald-50' : 'border-destructive/40 bg-red-50'}`}>
            <CardContent className="p-6 flex items-start gap-4">
              {isApproved
                ? <CheckCircle className="h-10 w-10 text-emerald-600 flex-shrink-0" />
                : <XCircle className="h-10 w-10 text-destructive flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <h2 className={`text-lg md:text-xl font-bold ${isApproved ? 'text-emerald-700' : 'text-destructive'}`}>
                  {isApproved ? 'Orçamento Aprovado' : 'Orçamento Rejeitado'}
                </h2>
                {quote.approver_name && (
                  <p className="text-sm mt-1 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    Por <strong>{quote.approver_name}</strong>
                  </p>
                )}
                {actedAt && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {format(new Date(actedAt), "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold font-display flex items-center justify-center gap-2 flex-wrap">
              Proposta Comercial
              {quote.is_demonstration && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] tracking-wider">
                  DEMONSTRAÇÃO
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {quote.quote_date ? format(new Date(quote.quote_date + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy") : '-'}
            </p>
            {quote.is_demonstration && (
              <p className="mt-2 text-xs text-amber-700 font-medium max-w-xl mx-auto">
                Esta proposta é uma demonstração e não representa uma oferta comercial vinculante.
              </p>
            )}
          </div>
        )}

        {/* Info */}
        <Card>
          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-semibold">{quote.client_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Vendedor responsável</p>
                <p className="font-semibold">{quote.salesperson || '-'}</p>
              </div>
            </div>
            {quote.proposal_validity && (
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Validade</p>
                  <p className="font-semibold">{quote.proposal_validity}</p>
                </div>
              </div>
            )}
            {quote.payment_terms && (
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Condições de pagamento</p>
                  <p className="font-semibold">{quote.payment_terms}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg">Itens ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden md:block px-5 pb-4">
              <div className="grid grid-cols-12 gap-3 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b pb-2 mb-2">
                <div className="col-span-6">Produto</div>
                <div className="col-span-1 text-center">Qtd</div>
                <div className="col-span-2 text-right">Unitário</div>
                <div className="col-span-3 text-right">Total</div>
              </div>
              <div className="divide-y">
                {items.map((item, i) => {
                  const unitPrice = parseFloat(item.unit_price) || 0;
                  const discount = parseFloat(item.discount_percent) || 0;
                  const hasDiscount = discount > 0 && unitPrice > 0;
                  const unitFinal = hasDiscount ? unitPrice * (1 - discount / 100) : unitPrice;
                  return (
                    <div key={item.id} className="grid grid-cols-12 gap-3 py-3 items-center">
                      <div className="col-span-6 flex items-start gap-3 min-w-0">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-14 h-14 object-contain rounded border bg-white flex-shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">#{i + 1}</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm leading-snug">{item.model || item.description}</p>
                          {item.brand && <p className="text-xs text-muted-foreground mt-0.5">{item.brand}</p>}
                          {item.specifications && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.specifications}</p>
                          )}
                        </div>
                      </div>
                      <div className="col-span-1 text-center text-sm font-medium">{item.quantity}</div>
                      <div className="col-span-2 text-right text-sm">
                        {hasDiscount ? (
                          <div>
                            <p className="text-xs text-muted-foreground line-through">{formatCurrency(unitPrice)}</p>
                            <p className="font-semibold text-primary">{formatCurrency(unitFinal)}</p>
                          </div>
                        ) : formatCurrency(unitPrice)}
                      </div>
                      <div className="col-span-3 text-right font-semibold text-sm">
                        {formatCurrency(parseFloat(item.line_total) || 0)}
                        {hasDiscount && (
                          <Badge variant="secondary" className="ml-1 text-[10px] bg-emerald-100 text-emerald-700">-{discount}%</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {items.map((item, i) => {
                const unitPrice = parseFloat(item.unit_price) || 0;
                const discount = parseFloat(item.discount_percent) || 0;
                const hasDiscount = discount > 0 && unitPrice > 0;
                const unitFinal = hasDiscount ? unitPrice * (1 - discount / 100) : unitPrice;
                const lineTotal = parseFloat(item.line_total) || 0;
                return (
                  <div key={item.id} className="p-4">
                    <div className="flex gap-3">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="w-16 h-16 object-contain rounded border bg-white flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">#{i + 1}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-snug">{item.model || item.description}</p>
                        {item.brand && <p className="text-xs text-muted-foreground mt-0.5">{item.brand}</p>}
                      </div>
                    </div>
                    {item.specifications && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{item.specifications}</p>
                    )}
                    <div className="mt-3 flex items-end justify-between gap-3 pt-3 border-t">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{item.quantity}x</span>
                        {' · '}
                        {hasDiscount ? (
                          <>
                            <span className="line-through">{formatCurrency(unitPrice)}</span>
                            {' '}
                            <span className="text-primary font-semibold">{formatCurrency(unitFinal)}</span>
                            <Badge variant="secondary" className="ml-1 text-[10px] bg-emerald-100 text-emerald-700">-{discount}%</Badge>
                          </>
                        ) : (
                          <span>{formatCurrency(unitPrice)}</span>
                        )}
                      </div>
                      <p className="font-bold text-primary">{formatCurrency(lineTotal)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
            {shipping > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1.5"><Truck className="h-4 w-4" /> Frete</span>
                <strong>{formatCurrency(shipping)}</strong>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-3 border-t">
              <span className="text-base font-semibold">Total</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(total)}</span>
            </div>
          </CardContent>
        </Card>

        {quote.notes && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.notes}</p></CardContent>
          </Card>
        )}

        {/* Desktop actions */}
        {!alreadyActed && (
          <div className="hidden md:flex gap-3 justify-center pt-2">
            <Button size="lg" variant="outline" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setDialogAction('rejected')} disabled={acting}>
              <XCircle className="h-5 w-5" /> Rejeitar
            </Button>
            <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8"
              onClick={() => setDialogAction('approved')} disabled={acting}>
              <CheckCircle className="h-5 w-5" /> Aprovar Orçamento
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          MCI Store — Sistema de Orçamentos
        </p>
      </div>

      {/* Mobile sticky footer actions */}
      {!alreadyActed && (
        <div className="md:hidden fixed bottom-0 inset-x-0 bg-background border-t p-3 flex gap-2 shadow-lg z-40">
          <Button variant="outline" className="flex-1 border-destructive/40 text-destructive gap-1.5 min-h-[48px]"
            onClick={() => setDialogAction('rejected')} disabled={acting}>
            <XCircle className="h-4 w-4" /> Rejeitar
          </Button>
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 min-h-[48px]"
            onClick={() => setDialogAction('approved')} disabled={acting}>
            <CheckCircle className="h-4 w-4" /> Aprovar
          </Button>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={dialogAction !== null} onOpenChange={(o) => !o && !acting && setDialogAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogAction === 'approved' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
            </DialogTitle>
            <DialogDescription>
              Informe seu nome completo para registrar a {dialogAction === 'approved' ? 'aprovação' : 'rejeição'} deste orçamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="approver">Nome de quem está confirmando</Label>
            <Input
              id="approver"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="Seu nome completo"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDialogAction(null)} disabled={acting}>Cancelar</Button>
            <Button
              onClick={confirmAction}
              disabled={acting || !approverName.trim()}
              className={dialogAction === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              variant={dialogAction === 'rejected' ? 'destructive' : 'default'}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {dialogAction === 'approved' ? 'Aprovar' : 'Rejeitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
