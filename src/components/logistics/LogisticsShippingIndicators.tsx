import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Package, Ban } from 'lucide-react';

interface LogisticsRecord {
  id: string;
  logistics_status: string;
  transportadora: string | null;
  data_envio: string | null;
}

interface ShippingIndicatorsProps {
  records: LogisticsRecord[];
}

export default function LogisticsShippingIndicators({ records }: ShippingIndicatorsProps) {
  let correios = 0;
  let transportadora = 0;
  let semEnvio = 0;

  records.forEach(r => {
    if (['enviado', 'em_transporte', 'entregue'].includes(r.logistics_status)) {
      const t = (r.transportadora || '').toLowerCase();
      if (t.includes('correio') || t.includes('sedex') || t.includes('pac')) {
        correios++;
      } else {
        transportadora++;
      }
    } else if (!['entregue'].includes(r.logistics_status) && !r.data_envio) {
      semEnvio++;
    }
  });

  const items = [
    { label: 'Via Correios', value: correios, icon: Package, color: 'text-blue-600 bg-blue-50' },
    { label: 'Via Transportadora', value: transportadora, icon: Truck, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Sem Envio', value: semEnvio, icon: Ban, color: 'text-gray-600 bg-gray-50' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Indicadores de Envio</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className={`flex flex-col items-center gap-1 p-3 rounded-xl ${item.color}`}>
                <Icon className="h-5 w-5" />
                <span className="text-xl font-bold">{item.value}</span>
                <span className="text-xs font-medium text-center">{item.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
