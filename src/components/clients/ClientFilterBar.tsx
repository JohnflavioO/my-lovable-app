import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Filter, SlidersHorizontal, X, ListFilter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SellerInfo {
  user_id: string;
  full_name: string;
}

interface PresetFilter {
  label: string;
  key: string;
}

const presetGroups: { title: string; filters: PresetFilter[] }[] = [
  {
    title: 'Vendas',
    filters: [
      { label: 'Clientes com vendas', key: 'com_venda' },
      { label: 'Clientes sem vendas', key: 'sem_venda' },
      { label: 'Vendas recentes (30 dias)', key: 'venda_recente_30d' },
      { label: 'Vendas há mais de 3 meses', key: 'venda_antiga_3m' },
      { label: 'Vendas recorrentes (2+)', key: 'venda_recorrente' },
    ],
  },
  {
    title: 'Negociações',
    filters: [
      { label: 'Negociações em andamento', key: 'negociacao_andamento' },
      { label: 'Negociação com contato recente', key: 'negociacao_contato_recente' },
      { label: 'Novos clientes sem negociação', key: 'sem_negociacao' },
    ],
  },
  {
    title: 'Contato',
    filters: [
      { label: 'Com último contato realizado', key: 'com_contato' },
      { label: 'Sem último contato', key: 'sem_contato' },
      { label: 'Sem contato há mais de 30 dias', key: 'contato_antigo_30d' },
    ],
  },
];

interface Props {
  canSeeAll: boolean;
  sellers: SellerInfo[];
  currentUserId: string;
  ownerFilter: string;
  onOwnerFilterChange: (v: string) => void;
  activeFilterCount: number;
  onOpenDrawer: () => void;
  onApplyPreset: (key: string) => void;
  activePreset: string | null;
  onClearAll: () => void;
}

export default function ClientFilterBar({
  canSeeAll, sellers, ownerFilter, onOwnerFilterChange,
  activeFilterCount, onOpenDrawer, onApplyPreset, activePreset, onClearAll,
}: Props) {
  const [presetOpen, setPresetOpen] = useState(false);

  const totalActive = activeFilterCount + (activePreset ? 1 : 0) + (ownerFilter !== 'mine' && ownerFilter !== '' ? 1 : 0);

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      {/* Responsável */}
      <Select value={ownerFilter || 'mine'} onValueChange={onOwnerFilterChange}>
        <SelectTrigger className="w-[180px] min-h-[40px] text-sm">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          {canSeeAll && <SelectItem value="all">Todos</SelectItem>}
          <SelectItem value="mine">Meus clientes</SelectItem>
          {canSeeAll && sellers.map(s => (
            <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Filtros predefinidos */}
      <Popover open={presetOpen} onOpenChange={setPresetOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 min-h-[40px]">
            <ListFilter className="h-4 w-4" />
            Filtros predefinidos
            {activePreset && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">1</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="max-h-80 overflow-y-auto p-2 space-y-3">
            {presetGroups.map(g => (
              <div key={g.title}>
                <p className="text-xs font-semibold text-muted-foreground px-2 mb-1">{g.title}</p>
                {g.filters.map(f => (
                  <button
                    key={f.key}
                    onClick={() => { onApplyPreset(f.key); setPresetOpen(false); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      activePreset === f.key ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Abrir drawer de filtros */}
      <Button variant="outline" size="sm" className="gap-1.5 min-h-[40px]" onClick={onOpenDrawer}>
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{activeFilterCount}</Badge>
        )}
      </Button>

      {/* Limpar filtros */}
      {totalActive > 0 && (
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground min-h-[40px]" onClick={onClearAll}>
          <X className="h-3.5 w-3.5" />
          Limpar filtros ({totalActive})
        </Button>
      )}
    </div>
  );
}
