import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CircleDollarSign } from 'lucide-react';

interface Props {
  records: any[];
  fmt: (v: number) => string;
}

export default function FinancialConversion({ records, fmt }: Props) {
  const { totalApproved, totalReceived, percent } = useMemo(() => {
    const totalApproved = records.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
    const totalReceived = records
      .filter(r => r.financial_status === 'pago')
      .reduce((s, r) => s + (parseFloat(r.amount_paid || r.total_amount) || 0), 0);
    const percent = totalApproved > 0 ? Math.round((totalReceived / totalApproved) * 100) : 0;
    return { totalApproved, totalReceived, percent };
  }, [records]);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-primary" /> Conversão Financeira
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Aprovado: <strong>{fmt(totalApproved)}</strong></span>
          <span className="text-muted-foreground">Recebido: <strong className="text-emerald-600">{fmt(totalReceived)}</strong></span>
        </div>
        <Progress value={percent} className="h-2" />
        <p className="text-center text-sm font-bold">{percent}% convertido</p>
      </CardContent>
    </Card>
  );
}
