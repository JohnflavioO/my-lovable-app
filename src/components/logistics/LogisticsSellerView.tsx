import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface LogisticsRecord {
  id: string;
  logistics_status: string;
  updated_at: string;
  salesperson?: string;
  created_by?: string;
}

interface SellerViewProps {
  records: LogisticsRecord[];
}

export default function LogisticsSellerView({ records }: SellerViewProps) {
  const now = new Date();
  const sellerMap: Record<string, { name: string; total: number; pending: number; late: number }> = {};

  records.forEach(r => {
    const key = r.created_by || 'unknown';
    const name = r.salesperson || 'Desconhecido';
    if (!sellerMap[key]) sellerMap[key] = { name, total: 0, pending: 0, late: 0 };
    sellerMap[key].total++;

    if (!['entregue'].includes(r.logistics_status)) {
      sellerMap[key].pending++;
      if (differenceInDays(now, new Date(r.updated_at)) >= 3) {
        sellerMap[key].late++;
      }
    }
  });

  const sellers = Object.values(sellerMap).sort((a, b) => b.total - a.total);

  if (sellers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Visão por Vendedor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sellers.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.total} pedido(s)</p>
              </div>
              <div className="flex items-center gap-2">
                {s.pending > 0 && (
                  <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                    {s.pending} pendente(s)
                  </Badge>
                )}
                {s.late > 0 && (
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                    {s.late} atrasado(s)
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
