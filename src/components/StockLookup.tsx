import { useState } from 'react';
import { Search, X, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

const STOCK_URL = 'https://estoquemci.vercel.app/#/consulta';

export default function StockLookup() {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleOpen = () => {
    setFailed(false);
    setLoading(true);
    setOpen(true);
  };

  return (
    <>
      <div className="mci-animated-border w-full sm:w-56">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            type="text"
            readOnly
            placeholder="Consultar estoque..."
            onFocus={handleOpen}
            onClick={handleOpen}
            className="pl-9 min-h-[44px] cursor-pointer bg-white border-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label="Consultar estoque MCI"
          />
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="p-0 w-full sm:max-w-[520px] lg:max-w-[720px] sm:w-[80vw] flex flex-col gap-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="px-5 py-3 border-b flex-row items-center justify-between space-y-0">
            <SheetTitle className="text-base font-display">Consulta de Estoque MCI</SheetTitle>
          </SheetHeader>
          <div className="flex-1 relative bg-muted/20">
            {failed ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground max-w-sm">
                  Não foi possível carregar a consulta de estoque no momento.
                </p>
                <Button variant="outline" size="sm" onClick={handleOpen}>Tentar novamente</Button>
              </div>
            ) : (
              <>
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                )}
                <iframe
                  key={open ? 'open' : 'closed'}
                  src={STOCK_URL}
                  title="Consulta de Estoque MCI"
                  className="w-full h-full border-0"
                  onLoad={() => setLoading(false)}
                  onError={() => { setFailed(true); setLoading(false); }}
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
