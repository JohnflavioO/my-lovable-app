import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface ClientFilters {
  companyName: string;
  createdFrom: string;
  createdTo: string;
  lastContactFrom: string;
  lastContactTo: string;
  lastSaleFrom: string;
  lastSaleTo: string;
  city: string;
  state: string;
  hasNegotiation: boolean | null;
  hasContact: boolean | null;
  hasSale: boolean | null;
}

export const emptyFilters: ClientFilters = {
  companyName: '',
  createdFrom: '',
  createdTo: '',
  lastContactFrom: '',
  lastContactTo: '',
  lastSaleFrom: '',
  lastSaleTo: '',
  city: '',
  state: '',
  hasNegotiation: null,
  hasContact: null,
  hasSale: null,
};

const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: ClientFilters;
  onChange: (f: ClientFilters) => void;
  onApply: () => void;
  onClear: () => void;
}

export default function ClientFilterDrawer({ open, onOpenChange, filters, onChange, onApply, onClear }: Props) {
  const update = (field: keyof ClientFilters, value: any) => {
    onChange({ ...filters, [field]: value });
  };

  const triStateNext = (current: boolean | null): boolean | null => {
    if (current === null) return true;
    if (current === true) return false;
    return null;
  };

  const triLabel = (current: boolean | null, yesLabel: string, noLabel: string) => {
    if (current === true) return yesLabel;
    if (current === false) return noLabel;
    return 'Todos';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:w-[380px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>Filtros Avançados</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-5 pb-6">
            {/* Empresa */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nome da empresa / cliente</Label>
              <Input
                placeholder="Buscar..."
                value={filters.companyName}
                onChange={e => update('companyName', e.target.value)}
              />
            </div>

            {/* Data criação */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Data de criação</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={filters.createdFrom} onChange={e => update('createdFrom', e.target.value)} />
                <Input type="date" value={filters.createdTo} onChange={e => update('createdTo', e.target.value)} />
              </div>
            </div>

            {/* Último contato */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Data do último contato</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={filters.lastContactFrom} onChange={e => update('lastContactFrom', e.target.value)} />
                <Input type="date" value={filters.lastContactTo} onChange={e => update('lastContactTo', e.target.value)} />
              </div>
            </div>

            {/* Última venda */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Data da última venda</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={filters.lastSaleFrom} onChange={e => update('lastSaleFrom', e.target.value)} />
                <Input type="date" value={filters.lastSaleTo} onChange={e => update('lastSaleTo', e.target.value)} />
              </div>
            </div>

            {/* Cidade / UF */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Cidade</Label>
                <Input placeholder="Cidade" value={filters.city} onChange={e => update('city', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">UF</Label>
                <Select value={filters.state || 'all'} onValueChange={v => update('state', v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <Label className="text-xs font-medium">Status</Label>

              <button
                type="button"
                onClick={() => update('hasNegotiation', triStateNext(filters.hasNegotiation))}
                className="flex items-center justify-between w-full text-sm px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors"
              >
                <span>Negociação</span>
                <Badge value={triLabel(filters.hasNegotiation, 'Possui', 'Sem negociação')} />
              </button>

              <button
                type="button"
                onClick={() => update('hasContact', triStateNext(filters.hasContact))}
                className="flex items-center justify-between w-full text-sm px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors"
              >
                <span>Contato realizado</span>
                <Badge value={triLabel(filters.hasContact, 'Com contato', 'Sem contato')} />
              </button>

              <button
                type="button"
                onClick={() => update('hasSale', triStateNext(filters.hasSale))}
                className="flex items-center justify-between w-full text-sm px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors"
              >
                <span>Venda</span>
                <Badge value={triLabel(filters.hasSale, 'Com venda', 'Sem venda')} />
              </button>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="px-6 py-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClear}>Limpar</Button>
          <Button className="flex-1" onClick={() => { onApply(); onOpenChange(false); }}>Aplicar filtros</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Badge({ value }: { value: string }) {
  const isAll = value === 'Todos';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      isAll ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary font-medium'
    }`}>
      {value}
    </span>
  );
}
