import AppLayout from '@/components/AppLayout';

export default function EcoflowCalculator() {
  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-2rem)]">
        <div className="mb-4">
          <h1 className="text-2xl font-bold font-display">Calculadora Ecoflow</h1>
          <p className="text-muted-foreground">Planejamento de energia EcoFlow</p>
        </div>
        <div className="flex-1 rounded-lg border overflow-hidden bg-background">
          <iframe
            src="https://ecoflowmci.lovable.app/"
            className="w-full h-full border-0"
            title="Calculadora Ecoflow"
            allow="clipboard-write"
          />
        </div>
      </div>
    </AppLayout>
  );
}
