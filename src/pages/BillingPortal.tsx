import { ExternalLink, RefreshCw } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';

const BILLING_URL = 'https://faturamentomcit.vercel.app/vendedor/pedidos';

export default function BillingPortal() {
  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-120px)] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Meu Faturamento</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consulte suas vendas, comissões, colocação e notas fiscais emitidas.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => {
              const frame = document.getElementById('billing-portal-frame') as HTMLIFrameElement | null;
              frame?.contentWindow?.location.reload();
            }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Button type="button" variant="outline" onClick={() => window.open(BILLING_URL, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="mr-2 h-4 w-4" /> Abrir em nova aba
            </Button>
          </div>
        </div>
        <div className="min-h-[600px] flex-1 overflow-hidden rounded-xl border bg-card">
          <iframe
            id="billing-portal-frame"
            title="Portal de faturamento do vendedor"
            src={BILLING_URL}
            className="h-[calc(100vh-220px)] min-h-[600px] w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-read; clipboard-write"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Entre com seu e-mail e senha do sistema de faturamento. São credenciais diferentes das usadas no CRM.
          Se o login não persistir, use “Abrir em nova aba” e avise o administrador.
        </p>
      </div>
    </AppLayout>
  );
}
