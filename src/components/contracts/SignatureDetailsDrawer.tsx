import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { signatureLabel, SIGNATURE_EVENT_LABEL } from '@/lib/signature/statusLabels';
import { Loader2, Download, Ban, RotateCcw, Copy, ShieldCheck, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: any | null;
  onChanged?: () => void;
}

export default function SignatureDetailsDrawer({ open, onOpenChange, contract, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open || !contract?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: reqs } = await supabase
          .from('contract_signature_requests')
          .select('*')
          .eq('contract_id', contract.id)
          .order('created_at', { ascending: false })
          .limit(1);
        const req = reqs?.[0] ?? null;
        setRequest(req);
        if (req) {
          const { data: evts } = await supabase
            .from('contract_signature_events')
            .select('*')
            .eq('signature_request_id', req.id)
            .order('created_at', { ascending: true });
          setEvents(evts ?? []);
        } else {
          setEvents([]);
        }
      } finally { setLoading(false); }
    })();
  }, [open, contract?.id]);

  const meta = signatureLabel(request?.status ?? contract?.signature_status);

  const cancel = async () => {
    if (!request) return;
    if (!confirm('Cancelar esta solicitação de assinatura?')) return;
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('contract-signature-owner', {
        body: { action: 'cancel', requestId: request.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha');
      toast.success('Solicitação cancelada');
      onChanged?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao cancelar');
    } finally { setWorking(false); }
  };

  const resend = async () => {
    if (!request) return;
    const publicUrl = prompt('Cole o link de assinatura para reenviar (mantenha o token original):');
    if (!publicUrl) return;
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('contract-signature-owner', {
        body: { action: 'resend', requestId: request.id, publicUrl },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha');
      toast.success(data.emailSent ? 'Convite reenviado' : 'Registro criado (e-mail não configurado)');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha');
    } finally { setWorking(false); }
  };

  const download = async (bucket: 'contract-originals' | 'contract-signed' | 'contract-evidence', path?: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) { toast.error('Falha ao gerar link'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const validationUrl = request?.validation_code
    ? `${window.location.origin}/validar-assinatura/${request.validation_code}`
    : null;

  const copyValidation = async () => {
    if (!validationUrl) return;
    await navigator.clipboard.writeText(validationUrl);
    toast.success('Link de validação copiado');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Assinatura eletrônica</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={meta.className}>
                <meta.icon className="w-3 h-3 mr-1" />
                {meta.label}
              </Badge>
            </div>

            {!request && (
              <p className="text-sm text-muted-foreground">
                Este contrato ainda não foi enviado para assinatura eletrônica.
              </p>
            )}

            {request && (
              <>
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Signatário:</span> {request.signer_name}</div>
                  <div><span className="text-muted-foreground">E-mail:</span> {request.signer_email}</div>
                  {request.signer_phone && (<div><span className="text-muted-foreground">Telefone:</span> {request.signer_phone}</div>)}
                  <div><span className="text-muted-foreground">Expira em:</span> {format(new Date(request.expires_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</div>
                  {request.signed_at && (<div><span className="text-muted-foreground">Assinado em:</span> {format(new Date(request.signed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</div>)}
                </div>

                <div className="flex flex-wrap gap-2">
                  {request.original_document_url && (
                    <Button size="sm" variant="outline" onClick={() => download('contract-originals', request.original_document_url)}>
                      <Download className="w-4 h-4 mr-1" /> PDF original
                    </Button>
                  )}
                  {request.signed_document_url && (
                    <Button size="sm" variant="outline" onClick={() => download('contract-signed', request.signed_document_url)}>
                      <Download className="w-4 h-4 mr-1" /> PDF assinado
                    </Button>
                  )}
                  {request.evidence_document_url && (
                    <Button size="sm" className="bg-[#0f2b26] hover:bg-[#0f2b26]/90" onClick={() => download('contract-evidence', request.evidence_document_url)}>
                      <ShieldCheck className="w-4 h-4 mr-1" /> Certificado de evidências
                    </Button>
                  )}
                  {['sent','viewed','awaiting_signature'].includes(request.status) && (
                    <>
                      <Button size="sm" variant="outline" onClick={resend} disabled={working}>
                        <RotateCcw className="w-4 h-4 mr-1" /> Reenviar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={cancel} disabled={working}>
                        <Ban className="w-4 h-4 mr-1" /> Cancelar
                      </Button>
                    </>
                  )}
                </div>

                {validationUrl && (
                  <div className="border rounded-lg p-3 bg-emerald-50/50 border-emerald-200 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <ShieldCheck className="w-4 h-4" /> Validação pública
                    </div>
                    <div className="text-xs text-emerald-900/80">Código: <span className="font-mono font-bold">{request.validation_code}</span></div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={copyValidation}>
                        <Copy className="w-3 h-3 mr-1" /> Copiar link
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={validationUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Abrir
                        </a>
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold mb-2">Linha do tempo</h4>
                  <ol className="border-l-2 border-emerald-200 pl-4 space-y-3">
                    {events.map((e) => (
                      <li key={e.id} className="relative text-xs">
                        <span className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                        <div className="font-medium text-slate-800">{SIGNATURE_EVENT_LABEL[e.event_type] ?? e.event_type}</div>
                        <div className="text-muted-foreground">
                          {format(new Date(e.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                          {e.ip_address ? ` • IP ${e.ip_address}` : ''}
                        </div>
                      </li>
                    ))}
                    {events.length === 0 && <li className="text-xs text-muted-foreground">Sem eventos ainda.</li>}
                  </ol>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
