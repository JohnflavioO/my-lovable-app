import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, Send, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: any;
  /** async function that returns the PDF as base64 (no data: prefix) */
  buildPdfBase64: (contract: any) => Promise<string>;
  onSent?: () => void;
}

export default function SendForSignatureDialog({ open, onOpenChange, contract, buildPdfBase64, onSent }: Props) {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const data = contract?.contract_data_json ?? {};
  const [name, setName] = useState<string>(data?.client?.responsible || data?.client?.name || '');
  const [document, setDocument] = useState<string>(data?.client?.document || contract?.client_document || '');
  const [email, setEmail] = useState<string>(data?.client?.email || '');
  const [phone, setPhone] = useState<string>(data?.client?.phone || contract?.responsible_phone || '');
  const [validityDays, setValidityDays] = useState<number>(15);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ publicUrl: string; emailSent: boolean; emailReason?: string | null } | null>(null);

  const handleSend = async () => {
    if (!name.trim() || !document.trim() || !email.trim()) {
      toast.error('Preencha nome, CPF e e-mail do signatário');
      return;
    }
    setSending(true);
    try {
      const pdfBase64 = await buildPdfBase64(contract);
      const { data: resp, error } = await supabase.functions.invoke('contract-signature-owner', {
        body: {
          action: 'send',
          contractId: contract.id,
          signer: { name, document, email, phone },
          validityDays,
          pdfBase64,
        },
      });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Falha ao enviar');
      setResult({ publicUrl: resp.publicUrl, emailSent: resp.emailSent, emailReason: resp.emailReason });
      setStep('success');
      onSent?.();
      toast.success(resp.emailSent ? 'Contrato enviado por e-mail' : 'Solicitação criada — envie o link manualmente');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar contrato');
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    if (!result?.publicUrl) return;
    navigator.clipboard.writeText(result.publicUrl);
    toast.success('Link copiado');
  };

  const openWhatsApp = () => {
    if (!result?.publicUrl) return;
    const msg = encodeURIComponent(`Olá ${name}, segue seu contrato MCI para assinatura eletrônica: ${result.publicUrl}`);
    const p = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${p ? '55' + p : ''}?text=${msg}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setStep('form'); setResult(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === 'form' ? 'Enviar contrato para assinatura' : 'Contrato enviado'}</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-3">
            <div>
              <Label>Nome completo do signatário</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div>
              <Label>Telefone (opcional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 91234-5678" />
            </div>
            <div>
              <Label>Validade do link (dias)</Label>
              <Input type="number" min={1} max={90} value={validityDays}
                onChange={(e) => setValidityDays(Math.max(1, Math.min(90, Number(e.target.value) || 15)))} />
            </div>
            <p className="text-xs text-muted-foreground">
              Após o envio, o conteúdo do contrato ficará bloqueado para edição. Para alterar, cancele a solicitação e reemita.
            </p>
          </div>
        )}

        {step === 'success' && result && (
          <div className="space-y-3">
            <p className="text-sm">
              {result.emailSent
                ? 'E-mail enviado ao signatário com o link de assinatura.'
                : 'Solicitação criada. O envio automático por e-mail não está configurado; use os botões abaixo.'}
            </p>
            <div className="p-3 bg-muted rounded-md break-all text-xs">{result.publicUrl}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyLink}><Copy className="w-4 h-4 mr-1" /> Copiar link</Button>
              <Button variant="outline" size="sm" onClick={openWhatsApp}><ExternalLink className="w-4 h-4 mr-1" /> WhatsApp</Button>
              <Button variant="outline" size="sm" onClick={() => window.open(result.publicUrl, '_blank')}>Abrir</Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'form' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar para assinatura
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Concluir</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
