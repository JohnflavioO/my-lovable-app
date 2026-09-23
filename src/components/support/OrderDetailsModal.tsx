import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { X, Pencil, Link2, Printer, FileText, Copy } from 'lucide-react';
import { STATUS_OPTIONS } from '@/pages/support/SupportOrders';
import { generateTechnicalQuotePdf, generateEquipmentReceiptPdf } from '@/lib/generateTechnicalPdf';

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

export default function OrderDetailsModal({ orderId, open, onOpenChange, onChanged }: Props) {
  const navigate = useNavigate();
  const [os, setOs] = useState<any>(null);
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTracking, setShowTracking] = useState(false);

  const load = async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('technical_orders' as any).select('*').eq('id', orderId).maybeSingle();
    setOs(data);
    const { data: p } = await supabase.from('technical_order_parts' as any).select('*').eq('order_id', orderId);
    setParts((p || []) as any[]);
    setLoading(false);
  };

  useEffect(() => { if (open && orderId) { load(); setShowTracking(false); } }, [open, orderId]);

  const updateStatus = async (status: string) => {
    if (!orderId || !os) return;
    const { error } = await supabase.from('technical_orders' as any).update({ status }).eq('id', orderId);
    if (error) return toast.error(error.message);
    toast.success('Status atualizado');
    setOs({ ...os, status });
    onChanged?.();
  };

  const trackingUrl = os?.public_token ? `${window.location.origin}/rastreamento/os/${os.public_token}` : '';

  const printReceipt = async () => {
    try { await generateEquipmentReceiptPdf(os); toast.success('Termo gerado'); }
    catch (e: any) { toast.error(e.message || 'Falha ao gerar PDF'); }
  };

  const canQuote = ['pronto', 'aguardando_aprovacao'].includes(os?.status);
  const genQuote = async () => {
    if (!canQuote) return toast.error('Disponível quando a OS estiver Pronta ou Aguardando Aprovação');
    try {
      // 1) Ensure a budget row exists in the Orçamentos sector (create if missing)
      const { data: existing } = await supabase
        .from('technical_budgets')
        .select('id')
        .eq('technical_order_id', os.id)
        .maybeSingle();

      const totalServices = Number(os.labor_value || 0);
      const totalParts = Number(os.parts_value || 0)
        || parts.reduce((s, p: any) => s + (Number(p.unit_price || 0) * Number(p.quantity || 1)), 0);
      const totalAmount = Math.max(0, totalServices + totalParts);

      if (!existing) {
        const { data: userRes } = await supabase.auth.getUser();
        const { error: insErr } = await supabase.from('technical_budgets').insert({
          technical_order_id: os.id,
          client_id: os.client_id || null,
          total_services: totalServices,
          total_parts: totalParts,
          discount: 0,
          total_amount: totalAmount,
          status: 'rascunho',
          notes: os.reported_defect || null,
          created_by: userRes?.user?.id,
        } as any);
        if (insErr) throw insErr;
      }

      // 2) Move OS to "Aguardando Aprovação" so the flow reflects it went to Orçamentos
      if (os.status === 'pronto') {
        await supabase.from('technical_orders' as any)
          .update({ status: 'aguardando_aprovacao' })
          .eq('id', os.id);
        setOs({ ...os, status: 'aguardando_aprovacao' });
        onChanged?.();
      }

      // 3) Generate the PDF as before
      await generateTechnicalQuotePdf(os, parts);

      toast.success(existing ? 'Orçamento atualizado e PDF gerado' : 'Orçamento enviado para o setor de Orçamentos');
      onOpenChange(false);
      navigate('/suporte/orcamentos');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao gerar orçamento');
    }
  };

  const serviceTypeLabel = (t?: string) => {
    if (!t) return '—';
    const key = t.toLowerCase();
    if (key.includes('garant')) return 'Garantia';
    if (key.includes('manut')) return 'Manutenção';
    if (key.includes('devol')) return 'Devolução';
    return 'Orçamento';
  };

  const accessories: string[] = Array.isArray(os?.accessories) ? os.accessories : [];
  const entry = os?.entry_date || os?.created_at;
  const entryFmt = entry ? new Date(entry).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        {loading || !os ? (
          <div className="p-10 text-center text-muted-foreground">Carregando...</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <div>
                <h2 className="text-xl font-bold font-display">Ordem de Serviço {os.os_number}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Entrada: {entryFmt}</p>
              </div>
              <button onClick={() => onOpenChange(false)} className="rounded-md p-1 hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status */}
              <section>
                <h3 className="text-sm font-semibold mb-3">Status Atual</h3>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(s => {
                    const active = os.status === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => !active && updateStatus(s.key)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-background border-border hover:border-primary/50 hover:bg-muted'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Two columns */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Equipamento</div>
                  <div className="font-medium">{os.equipment || '—'} {os.model && <span className="text-muted-foreground">/ {os.model}</span>}</div>
                  {os.brand && <div className="text-sm text-muted-foreground">{os.brand}</div>}
                  <div className="text-xs text-muted-foreground mt-2">
                    Nº Série: <span className="font-mono">{os.serial || '—'}</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Cliente</div>
                  <div className="font-medium">{os.client_name || '—'}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Tipo de Serviço: <span className="font-medium text-foreground">{serviceTypeLabel(os.os_type)}</span>
                  </div>
                </div>
              </div>

              {/* Defect */}
              <section>
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Defeito Reclamado</div>
                <div className="rounded-lg bg-muted/50 border px-4 py-3 text-sm whitespace-pre-wrap min-h-[52px]">
                  {os.reported_defect || <span className="text-muted-foreground italic">Nenhum defeito registrado</span>}
                </div>
              </section>

              {/* Physical condition */}
              <section>
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Estado Físico / Condições</div>
                <div className="rounded-lg bg-muted/50 border px-4 py-3 text-sm whitespace-pre-wrap min-h-[52px]">
                  {os.physical_condition || <span className="text-muted-foreground italic">Sem observações</span>}
                </div>
              </section>

              {/* Accessories */}
              <section>
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Acessórios Checados</div>
                {accessories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {accessories.map((a, i) => (
                      <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">Nenhum acessório registrado</div>
                )}
              </section>

              {/* Tracking inline */}
              {showTracking && (
                <section className="rounded-lg border bg-accent/5 p-4 space-y-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Link de Rastreio</div>
                  <div className="flex gap-2">
                    <Input readOnly value={trackingUrl} className="text-xs font-mono" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(trackingUrl); toast.success('Link copiado'); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={() => {
                      const phone = String(os?.client_phone || '').replace(/\D/g, '');
                      const text = encodeURIComponent(`Olá ${os.client_name || ''}, acompanhe sua OS ${os.os_number}: ${trackingUrl}`);
                      window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
                    }}>
                      WhatsApp
                    </Button>
                  </div>
                </section>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30">
              <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate(`/suporte/os/${os.id}`); }}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />Editar Dados
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTracking(v => !v)}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" />Enviar Rastreio
              </Button>
              <Button variant="outline" size="sm" onClick={printReceipt}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />Imprimir Termo
              </Button>
              <Button
                size="sm"
                onClick={genQuote}
                disabled={!canQuote}
                className="bg-[#00966d] hover:bg-[#007a58] disabled:opacity-50"
                title={canQuote ? '' : 'Disponível quando a OS estiver Pronta ou Aguardando Aprovação'}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />Gerar Orçamento
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
