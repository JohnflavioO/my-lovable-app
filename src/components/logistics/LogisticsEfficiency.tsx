import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { differenceInDays } from 'date-fns';
import { Timer, Truck, PackageCheck } from 'lucide-react';

interface LogisticsRecord {
  id: string;
  logistics_status: string;
  nf_data: string | null;
  data_envio: string | null;
  data_entrega: string | null;
  created_at: string;
  approved_at?: string;
}

interface EfficiencyProps {
  records: LogisticsRecord[];
}

function avgDays(values: number[]): string {
  if (values.length === 0) return '-';
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return `${avg.toFixed(1)} dias`;
}

export default function LogisticsEfficiency({ records }: EfficiencyProps) {
  const nfTimes: number[] = [];
  const sendTimes: number[] = [];
  const deliveryTimes: number[] = [];

  records.forEach(r => {
    const start = r.approved_at ? new Date(r.approved_at) : new Date(r.created_at);

    if (r.nf_data) {
      const days = differenceInDays(new Date(r.nf_data), start);
      if (days >= 0) nfTimes.push(days);
    }

    if (r.data_envio) {
      const days = differenceInDays(new Date(r.data_envio), start);
      if (days >= 0) sendTimes.push(days);
    }

    if (r.data_entrega && r.data_envio) {
      const days = differenceInDays(new Date(r.data_entrega), new Date(r.data_envio));
      if (days >= 0) deliveryTimes.push(days);
    }
  });

  const metrics = [
    { label: 'Tempo médio p/ NF', value: avgDays(nfTimes), icon: Timer, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Tempo médio p/ Envio', value: avgDays(sendTimes), icon: Truck, color: 'text-teal-600 bg-teal-50' },
    { label: 'Tempo médio de Entrega', value: avgDays(deliveryTimes), icon: PackageCheck, color: 'text-green-600 bg-green-50' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Eficiência Logística</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {metrics.map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className={`flex items-center gap-3 p-4 rounded-xl ${m.color}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-bold">{m.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
