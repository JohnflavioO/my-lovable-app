import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, ShieldAlert, Download, FileText, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SIGNATURE_EVENT_LABEL } from '@/lib/signature/statusLabels';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface ValidationData {
  ok: boolean;
  error?: string;
  signature?: any;
  contract?: any;
  events?: any[];
  signedPdfUrl?: string | null;
  evidencePdfUrl?: string | null;
}

export default function PublicValidateSignature() {
  const { code } = useParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ValidationData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/contract-signature-public`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${SUPABASE_ANON}`,
          },
          body: JSON.stringify({ action: 'validate', code }),
        });
        const j = await resp.json();
        if (!cancelled) setData(j);
      } catch (e: any) {
        if (!cancelled) setData({ ok: false, error: e?.message ?? 'Erro' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
      </div>
    );
  }

  const valid = data?.ok === true;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-[#0f2b26] font-bold text-lg">MCI • Validação de Assinatura</div>
          <Link to="/" className="text-xs text-muted-foreground flex items-center gap-1 hover:underline">
            <ArrowLeft className="w-3 h-3" /> Início
          </Link>
        </div>

        <Card className={valid ? 'border-emerald-300' : 'border-red-300'}>
          <CardHeader className={valid ? 'bg-emerald-50' : 'bg-red-50'}>
            <CardTitle className="flex items-center gap-2 text-lg">
              {valid ? (
                <><ShieldCheck className="w-6 h-6 text-emerald-700" /> Assinatura válida</>
              ) : (
                <><ShieldAlert className="w-6 h-6 text-red-700" /> Assinatura não encontrada</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Código público:</span>{' '}
              <span className="font-mono font-semibold">{code}</span>
            </div>
            {!valid && (
              <p className="text-sm text-red-700">
                {data?.error ?? 'O código informado não corresponde a nenhuma assinatura concluída no CRM MCI.'}
              </p>
            )}
            {valid && data?.signature && (
              <>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Info label="Signatário" value={data.signature.signer.name} />
                  <Info label="CPF" value={data.signature.signer.documentMasked} />
                  <Info label="E-mail" value={data.signature.signer.emailHint} />
                  <Info label="Método" value={data.signature.method ?? '—'} />
                  <Info
                    label="Assinado em"
                    value={data.signature.signed_at
                      ? format(new Date(data.signature.signed_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
                      : '—'}
                  />
                  <Info label="IP do signatário" value={data.signature.ip ?? '—'} />
                </div>
                {data.contract && (
                  <div className="border rounded-lg p-3 bg-slate-50 space-y-1 text-sm">
                    <div className="font-semibold text-[#0f2b26]">{data.contract.title}</div>
                    <div><span className="text-muted-foreground">Nº:</span> {data.contract.number}</div>
                    <div><span className="text-muted-foreground">Cliente:</span> {data.contract.client}</div>
                  </div>
                )}
                <div className="border rounded-lg p-3 text-xs space-y-1 bg-slate-50">
                  <div className="font-semibold text-slate-700 mb-1">Integridade</div>
                  <HashLine label="SHA-256 do original" value={data.signature.original_hash} />
                  <HashLine label="SHA-256 do assinado" value={data.signature.signed_hash} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {data.signedPdfUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={data.signedPdfUrl} target="_blank" rel="noreferrer">
                        <FileText className="w-4 h-4 mr-1" /> PDF assinado
                      </a>
                    </Button>
                  )}
                  {data.evidencePdfUrl && (
                    <Button asChild size="sm" className="bg-[#0f2b26] hover:bg-[#0f2b26]/90">
                      <a href={data.evidencePdfUrl} target="_blank" rel="noreferrer">
                        <Download className="w-4 h-4 mr-1" /> Certificado de evidências
                      </a>
                    </Button>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Trilha de auditoria</h4>
                  <ol className="border-l-2 border-emerald-200 pl-4 space-y-3">
                    {(data.events ?? []).map((e: any, i: number) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                        <div className="text-sm font-medium text-slate-800">
                          {SIGNATURE_EVENT_LABEL[e.event_type] ?? e.event_type}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {e.created_at ? format(new Date(e.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }) : ''}
                          {e.ip_address ? ` • IP ${e.ip_address}` : ''}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                  Documento assinado eletronicamente e validado pelo CRM MCI
                </Badge>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function HashLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-mono break-all">{value ?? '—'}</span>
    </div>
  );
}
