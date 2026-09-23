import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock } from 'lucide-react';

interface Props {
  onFilterOverdue: () => void;
  onFilterPending: () => void;
}

export default function FinancialQuickActions({ onFilterOverdue, onFilterPending }: Props) {
  return (
    <div className="flex flex-wrap gap-2 mb-4 md:mb-6">
      <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={onFilterOverdue}>
        <AlertTriangle className="h-3.5 w-3.5" /> Ver Vencidos
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5 text-yellow-600 border-yellow-200 hover:bg-yellow-50" onClick={onFilterPending}>
        <Clock className="h-3.5 w-3.5" /> Ver Pendentes
      </Button>
    </div>
  );
}
