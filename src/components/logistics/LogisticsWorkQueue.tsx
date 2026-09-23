import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, FileText, PackageCheck, AlertTriangle, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkQueueProps {
  stats: {
    aguardando: number;
    emitindoNf: number;
    prontoEnvio: number;
    semRastreio: number;
    problemas: number;
  };
  onNavigate: (statusFilter: string, tab: string) => void;
}

const queueItems = [
  { key: 'aguardando', stat: 'aguardando', label: 'Aguardando Entrada', icon: Clock, filter: 'aguardando_entrada', tab: 'pedidos', bg: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200', iconColor: 'text-yellow-600', valueColor: 'text-yellow-700' },
  { key: 'emitindoNf', stat: 'emitindoNf', label: 'Emitir NF Pendente', icon: FileText, filter: '', tab: 'nf', bg: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200', iconColor: 'text-indigo-600', valueColor: 'text-indigo-700' },
  { key: 'prontoEnvio', stat: 'prontoEnvio', label: 'Pronto para Envio', icon: PackageCheck, filter: 'pronto_envio', tab: 'pedidos', bg: 'bg-teal-50 hover:bg-teal-100 border-teal-200', iconColor: 'text-teal-600', valueColor: 'text-teal-700' },
  { key: 'semRastreio', stat: 'semRastreio', label: 'Sem Rastreio', icon: AlertTriangle, filter: '', tab: 'rastreamento', bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200', iconColor: 'text-orange-600', valueColor: 'text-orange-700' },
  { key: 'problemas', stat: 'problemas', label: 'Com Problemas', icon: TriangleAlert, filter: '', tab: 'problemas', bg: 'bg-red-50 hover:bg-red-100 border-red-200', iconColor: 'text-red-600', valueColor: 'text-red-700' },
];

export default function LogisticsWorkQueue({ stats, onNavigate }: WorkQueueProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Fila de Trabalho Logística</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {queueItems.map(item => {
            const Icon = item.icon;
            const count = stats[item.stat as keyof typeof stats] || 0;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.filter, item.tab)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors cursor-pointer',
                  item.bg
                )}
              >
                <Icon className={cn('h-6 w-6', item.iconColor)} />
                <span className={cn('text-2xl font-bold', item.valueColor)}>{count}</span>
                <span className="text-xs text-center font-medium text-muted-foreground leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
