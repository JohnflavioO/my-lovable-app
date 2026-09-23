import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { startOfDay, subDays, isBefore } from 'date-fns';

interface Props {
  records: any[];
  fmt: (v: number) => string;
}

export default function FinancialAlerts({ records, fmt }: Props) {
  const alerts = useMemo(() => {
    const today = startOfDay(new Date());
    const active = records.filter(r => !['pago', 'cancelado'].includes(r.financial_status));
    const result: { text: string; severity: 'red' | 'yellow' | 'blue' }[] = [];

    // Clients with overdue
    const overdueByClient: Record<string, number> = {};
    active.filter(r => r.due_date && isBefore(new Date(r.due_date), today)).forEach(r => {
      const name = r.client_name || 'Sem cliente';
      overdueByClient[name] = (overdueByClient[name] || 0) + 1;
    });
    const topOverdueClients = Object.entries(overdueByClient).sort((a, b) => b[1] - a[1]).slice(0, 3);
    topOverdueClients.forEach(([name, count]) => {
      result.push({ text: `${name} com ${count} título(s) vencido(s)`, severity: 'red' });
    });

    // Old unpaid orders (>30 days)
    const old = active.filter(r => r.due_date && isBefore(new Date(r.due_date), subDays(today, 30)));
    if (old.length > 0) {
      result.push({ text: `${old.length} pedido(s) com mais de 30 dias sem pagamento`, severity: 'yellow' });
    }

    // High values open (>5000)
    const highValue = active.filter(r => (parseFloat(r.total_amount) || 0) > 5000);
    if (highValue.length > 0) {
      const total = highValue.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
      result.push({ text: `${highValue.length} conta(s) acima de R$ 5.000 em aberto (${fmt(total)})`, severity: 'blue' });
    }

    return result;
  }, [records, fmt]);

  if (alerts.length === 0) return null;

  const severityStyles = {
    red: 'bg-red-50 border-red-200 text-red-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" /> Alertas
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {alerts.map((a, i) => (
          <div key={i} className={cn("text-xs px-3 py-2 rounded-lg border", severityStyles[a.severity])}>
            {a.text}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
