import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ShieldCheck, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import SignatureCanvas from 'react-signature-canvas';
import { signatureLabel } from '@/lib/signature/statusLabels';

type Step = 'loading' | 'closed' | 'identity' | 'otp_request' | 'otp_verify' | 'sign' | 'signed';

export default function PublicSignContract() {
  const { token = '' } = useParams();
  const [step, setStep] = useState<Step>('loading');
  const [data, setData] = useState<any>(null);
  const [working, setWorking] = useState(false);

  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [method, setMethod] = useState<'typed' | 'drawn'>('drawn');
  const [typedName, setTypedName] = useState('');
  const [accept, setAccept] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);

  const fetchData = async () => {
    try {
      const { data: resp, error } = await supabase.functions.invoke('contract-signature-public', {
        body: { action: 'fetch', token },
      });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Erro');
      setData(resp);
      if (resp.request.status === 'signed') setStep('signed');
      else if (['cancelled','refused'].includes(resp.request.status) || resp.request.expired) setStep('closed');
      else if (resp.request.status === 'awaiting_signature') setStep('otp_request');
      else setStep('identity');
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao carregar');
      setStep('closed');
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  const confirmIdentity = async () => {
    setWorking(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('contract-signature-public', {
        body: { action: 'confirm_identity', token, name, document, email },
      });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Erro');
      setStep('otp_request');
      toast.success('Identidade confirmada');
    } catch (e: any) { toast.error(e?.message ?? 'Erro'); } finally { setWorking(false); }
  };

  const requestOtp = async () => {
    setWorking(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('contract-signature-public', {
        body: { action: 'request_otp', token },
      });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Erro');
      toast.success(resp.emailSent ? 'Código enviado ao seu e-mail' : 'Código gerado (verifique com o remetente)');
      setStep('otp_verify');
    } catch (e: any) { toast.error(e?.message ?? 'Erro'); } finally { setWorking(false); }
  };

  const verifyOtp = async () => {
    setWorking(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('contract-signature-public', {
        body: { action: 'verify_otp', token, code: otp },
      });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Erro');
      setStep('sign');
    } catch (e: any) { toast.error(e?.message ?? 'Erro'); } finally { setWorking(false); }
  };

  const sign = async () => {
    if (!accept) { toast.error('Aceite os termos'); return; }
    let signatureImageBase64: string | null = null;
    if (method === 'drawn') {
      if (sigRef.current?.isEmpty()) { toast.error('Desenhe sua assinatura'); return; }
      signatureImageBase64 = sigRef.current!.getTrimmedCanvas().toDataURL('image/png');
    }
    if (method === 'typed' && !typedName.trim()) { toast.error('Digite seu nome'); return; }

    setWorking(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('contract-signature-public', {
        body: {
          action: 'sign', token, method, typedName, signatureImageBase64, acceptedTerms: true,
        },
      });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Erro');
      toast.success('Contrato assinado com sucesso!');
      await fetchData();
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao assinar'); } finally { setWorking(false); }
  };

  const refuse = async () => {
    if (!confirm('Recusar este contrato?')) return;
    const reason = prompt('Motivo (opcional):');
    setWorking(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('contract-signature-public', {
        body: { action: 'refuse', token, reason },
      });
      if (error) throw error;
      if (!resp?.ok) throw new Error(resp?.error || 'Erro');
      toast.success('Recusa registrada');
      await fetchData();
    } catch (e: any) { toast.error(e?.message ?? 'Erro'); } finally { setWorking(false); }
  };

  if (step === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8" /></div>;
  }

  const meta = signatureLabel(data?.request?.status);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0f2b26] text-white py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <div className="font-bold">MCI Store</div>
              <div className="text-xs opacity-80">Assinatura Eletrônica</div>
            </div>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full border ${meta.className}`}>{meta.label}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="p-4 border-b bg-slate-50">
            <h1 className="font-semibold">{data?.contract?.title}</h1>
            <p className="text-sm text-muted-foreground">
              Contrato Nº {data?.contract?.number} • Cliente {data?.contract?.client}
            </p>
          </div>
          {data?.request?.pdfUrl ? (
            <iframe src={data.request.pdfUrl} title="Contrato" className="w-full h-[600px]" />
          ) : data?.request?.signedPdfUrl ? (
            <iframe src={data.request.signedPdfUrl} title="Contrato assinado" className="w-full h-[600px]" />
          ) : (
            <div className="p-10 text-center text-muted-foreground">Documento indisponível.</div>
          )}
        </section>

        <aside className="bg-white rounded-lg shadow-sm border p-5 space-y-4">
          {step === 'closed' && (
            <div className="text-center space-y-2">
              <XCircle className="w-10 h-10 text-red-500 mx-auto" />
              <p className="font-semibold">Este link não está mais disponível</p>
              <p className="text-sm text-muted-foreground">A solicitação foi cancelada, recusada ou expirou.</p>
            </div>
          )}

          {step === 'signed' && (
            <div className="text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="font-semibold">Contrato assinado</p>
              <p className="text-sm text-muted-foreground">Obrigado, {data?.request?.signer?.name?.split(' ')[0]}!</p>
              {data?.request?.signedPdfUrl && (
                <Button className="w-full" onClick={() => window.open(data.request.signedPdfUrl, '_blank')}>
                  Baixar PDF assinado
                </Button>
              )}
            </div>
          )}

          {step === 'identity' && (
            <>
              <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Confirme sua identidade</h3>
              <p className="text-xs text-muted-foreground">
                Signatário: <strong>{data?.request?.signer?.name}</strong><br />
                CPF: {data?.request?.signer?.documentMasked}<br />
                E-mail: {data?.request?.signer?.emailHint}
              </p>
              <div><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>CPF</Label><Input value={document} onChange={(e) => setDocument(e.target.value)} /></div>
              <div><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
              <Button className="w-full" onClick={confirmIdentity} disabled={working}>Confirmar</Button>
              <Button variant="ghost" className="w-full text-red-600" onClick={refuse}>Recusar contrato</Button>
            </>
          )}

          {step === 'otp_request' && (
            <>
              <h3 className="font-semibold">Verificação por e-mail</h3>
              <p className="text-sm text-muted-foreground">
                Enviaremos um código de 6 dígitos para <strong>{data?.request?.signer?.emailHint}</strong>.
              </p>
              <Button className="w-full" onClick={requestOtp} disabled={working}>Enviar código</Button>
            </>
          )}

          {step === 'otp_verify' && (
            <>
              <h3 className="font-semibold">Digite o código</h3>
              <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" className="text-center text-2xl tracking-widest" />
              <Button className="w-full" onClick={verifyOtp} disabled={working || otp.length !== 6}>Validar</Button>
              <Button variant="ghost" className="w-full" onClick={requestOtp} disabled={working}>Reenviar código</Button>
            </>
          )}

          {step === 'sign' && (
            <>
              <h3 className="font-semibold">Assine o contrato</h3>
              <div className="flex gap-2">
                <Button size="sm" variant={method === 'drawn' ? 'default' : 'outline'} onClick={() => setMethod('drawn')}>Desenhar</Button>
                <Button size="sm" variant={method === 'typed' ? 'default' : 'outline'} onClick={() => setMethod('typed')}>Digitar</Button>
              </div>
              {method === 'drawn' && (
                <div className="border rounded bg-white">
                  <SignatureCanvas ref={sigRef} canvasProps={{ className: 'w-full h-32' }} />
                  <div className="p-2 border-t flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => sigRef.current?.clear()}>Limpar</Button>
                  </div>
                </div>
              )}
              {method === 'typed' && (
                <Input value={typedName} onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Digite seu nome completo" className="text-xl" />
              )}
              <label className="flex gap-2 items-start text-xs">
                <Checkbox checked={accept} onCheckedChange={(c) => setAccept(c === true)} />
                <span>Declaro que li, compreendi e concordo com o conteúdo integral deste documento e reconheço esta assinatura eletrônica como manifestação da minha vontade.</span>
              </label>
              <Button className="w-full" onClick={sign} disabled={working || !accept}>
                {working ? <Loader2 className="animate-spin w-4 h-4 mr-1" /> : null}
                Assinar contrato
              </Button>
              <Button variant="ghost" className="w-full text-red-600" onClick={refuse}>Recusar contrato</Button>
            </>
          )}
        </aside>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-6">
        Documento protegido por assinatura eletrônica MCI • ID {data?.request?.id?.slice(0, 8)}
      </footer>
    </div>
  );
}
