import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import FreightQuoteModule from './FreightQuoteModule';
import type { FreightData } from '@/lib/freight';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freightData?: FreightData;
  quoteContext?: {
    quoteId?: string;
    quoteNumber?: string;
  };
  onCepOrigemChange?: (cep: string) => void;
}

export default function FreightQuoteDrawer({ open, onOpenChange, freightData, quoteContext, onCepOrigemChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 w-full sm:max-w-[760px] sm:w-[85vw] flex flex-col gap-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5 py-3 border-b flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base font-display">
            Cotação de Frete
            {quoteContext?.quoteNumber && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                · {quoteContext.quoteNumber}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <FreightQuoteModule
            freightData={freightData}
            quoteNumber={quoteContext?.quoteNumber}
            onCepOrigemChange={onCepOrigemChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
