import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, CalendarDays, CalendarClock } from 'lucide-react';
import { startOfDay, addDays, isBefore, isToday } from 'date-fns';

interface Props {
  records: any[];
  fmt: (v: number) => string;
}

export default function FinancialActionsDoDia({ records, fmt }: Props) {
  const data = useMemo(() => {
    const today = startOfDay(new Date());
    const in3days = addDays(today, 3);
    const active = records.filter(r => !['pago', 'cancelado'].includes(r.financial_status));

    const vencidos = active.filter(r => r.due_date && isBefore(new Date(r.due_date), today) && !isToday(new Date(r.due_date)));
    const venceHoje = active.filter(r => r.due_date && isToday(new Date(r.due_date)));
    const prox3 = active.filter(r => {
      if (!r.due_date) return false;
      const d = new Date(r.due_date);
      return d > today && d <= in3days && !isToday(d);
    });

    const sumVal = (arr: any[]) => arr.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);

    return [
      { label: 'Vencidos', icon: AlertTriangle, count: vencidos.length, value: sumVal(vencidos), color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
      { label: 'Vencem Hoje', icon: CalendarDays, count: venceHoje.length, value: sumVal(venceHoje), color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
      { label: 'Próx. 3 dias', icon: CalendarClock, count: prox3.length, value: sumVal(prox3), color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    ];
  }, [records]);

  return (
    <Card className="shadow-card mb-4 md:mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display">📋 Ações do Dia</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {data.map(d => {
            const Icon = d.icon;
            return (
              <div key={d.label} className={cn("flex items-center gap-3 p-3 rounded-lg border", d.bg)}>
                <Icon className={cn("h-5 w-5 shrink-0", d.color)} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{d.label}</p>
                  <p className={cn("text-lg font-bold", d.color)}>{d.count}</p>
                  <p className="text-[11px] text-muted-foreground">{fmt(d.value)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
