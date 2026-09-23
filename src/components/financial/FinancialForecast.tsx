import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { startOfDay, addDays } from 'date-fns';

interface Props {
  records: any[];
  fmt: (v: number) => string;
}

export default function FinancialForecast({ records, fmt }: Props) {
  const forecast = useMemo(() => {
    const today = startOfDay(new Date());
    const in7 = addDays(today, 7);
    const in30 = addDays(today, 30);
    const active = records.filter(r => !['pago', 'cancelado'].includes(r.financial_status) && r.due_date);

    const sumRange = (start: Date, end: Date) =>
      active.filter(r => {
        const d = new Date(r.due_date);
        return d >= start && d <= end;
      }).reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);

    return [
      { label: 'Hoje', value: sumRange(today, addDays(today, 1)) },
      { label: '7 dias', value: sumRange(today, in7) },
      { label: '30 dias', value: sumRange(today, in30) },
    ];
  }, [records]);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Previsão de Recebimentos
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {forecast.map(f => (
            <div key={f.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-bold">{fmt(f.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
