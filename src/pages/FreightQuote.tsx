import AppLayout from '@/components/AppLayout';
import FreightQuoteModule from '@/components/FreightQuoteModule';

export default function FreightQuote() {
  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-2rem)]">
        <div className="mb-4">
          <h1 className="text-2xl font-bold font-display">Cotação de Frete</h1>
          <p className="text-muted-foreground">Calcule rapidamente valores e prazos de transporte para seus pedidos.</p>
        </div>
        <div className="flex-1 rounded-lg border overflow-hidden bg-background">
          <FreightQuoteModule />
        </div>
      </div>
    </AppLayout>
  );
}
