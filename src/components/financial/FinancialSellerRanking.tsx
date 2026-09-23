import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, AlertTriangle, DollarSign, Clock } from 'lucide-react';

interface SellerRankingProps {
  records: any[];
  profilesMap: Record<string, string>;
  fmt: (v: number) => string;
}

export default function FinancialSellerRanking({ records, profilesMap, fmt }: SellerRankingProps) {
  const rankings = useMemo(() => {
    const byUser: Record<string, any[]> = {};
    records.forEach(r => {
      const uid = r.created_by || 'unknown';
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(r);
    });

    const entries = Object.entries(byUser).map(([uid, recs]) => {
      const active = recs.filter(r => !['pago', 'cancelado'].includes(r.financial_status));
      const paid = recs.filter(r => r.financial_status === 'pago');
      const overdue = recs.filter(r => r.financial_status === 'vencido');
      return {
        uid,
        name: profilesMap[uid] || 'Desconhecido',
        openValue: active.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
        paidValue: paid.reduce((s, r) => s + (parseFloat(r.amount_paid || r.total_amount) || 0), 0),
        pendingCount: active.length,
        overdueCount: overdue.length,
      };
    });

    return {
      topOpen: [...entries].sort((a, b) => b.openValue - a.openValue).slice(0, 3),
      topPaid: [...entries].sort((a, b) => b.paidValue - a.paidValue).slice(0, 3),
      topPending: [...entries].sort((a, b) => b.pendingCount - a.pendingCount).slice(0, 3),
      topOverdue: [...entries].filter(e => e.overdueCount > 0).sort((a, b) => b.overdueCount - a.overdueCount).slice(0, 3),
    };
  }, [records, profilesMap]);

  const sections = [
    { title: 'Maior Valor em Aberto', icon: DollarSign, data: rankings.topOpen, renderValue: (e: any) => fmt(e.openValue), color: 'text-blue-600' },
    { title: 'Maior Volume Recebido', icon: TrendingUp, data: rankings.topPaid, renderValue: (e: any) => fmt(e.paidValue), color: 'text-emerald-600' },
    { title: 'Mais Pendências', icon: Clock, data: rankings.topPending, renderValue: (e: any) => `${e.pendingCount} pendências`, color: 'text-yellow-600' },
    { title: 'Mais Atrasos', icon: AlertTriangle, data: rankings.topOverdue, renderValue: (e: any) => `${e.overdueCount} vencidos`, color: 'text-red-600' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
      {sections.map(sec => {
        const Icon = sec.icon;
        return (
          <Card key={sec.title} className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-display flex items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5", sec.color)} /> {sec.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {sec.data.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum</p>
              ) : (
                <div className="space-y-1.5">
                  {sec.data.map((e, i) => (
                    <div key={e.uid} className="flex items-center justify-between text-xs">
                      <span className="truncate">
                        <span className="text-muted-foreground mr-1">{i + 1}.</span>
                        {e.name}
                      </span>
                      <span className={cn("font-semibold whitespace-nowrap ml-2", sec.color)}>
                        {sec.renderValue(e)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
