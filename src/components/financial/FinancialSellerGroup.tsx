import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ArrowDownCircle, User, AlertTriangle, Clock, DollarSign, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const financialStatusLabels: Record<string, { label: string; color: string }> = {
  aguardando_pagamento: { label: 'Aguardando', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  vence_hoje: { label: 'Vence Hoje', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  em_aberto: { label: 'Em Aberto', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  pago_parcial: { label: 'Pago Parcial', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  pago: { label: 'Pago', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800 border-red-200' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const paymentMethodConfig: Record<string, { label: string; color: string }> = {
  pix: { label: 'PIX', color: 'text-teal-600' },
  cartao: { label: 'Cartão', color: 'text-purple-600' },
  boleto: { label: 'Boleto', color: 'text-amber-600' },
};

interface SellerGroupProps {
  sellerName: string;
  records: any[];
  canEdit: boolean;
  isMobile: boolean;
  onBaixa: (record: any) => void;
  fmt: (v: number) => string;
}

export default function FinancialSellerGroup({ sellerName, records, canEdit, isMobile, onBaixa, fmt }: SellerGroupProps) {
  const stats = useMemo(() => {
    const active = records.filter(r => !['pago', 'cancelado'].includes(r.financial_status));
    const paid = records.filter(r => r.financial_status === 'pago');
    const overdue = records.filter(r => r.financial_status === 'vencido');
    return {
      totalReceivable: active.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
      totalPaid: paid.reduce((s, r) => s + (parseFloat(r.amount_paid || r.total_amount) || 0), 0),
      pending: active.length,
      overdue: overdue.length,
      total: records.length,
    };
  }, [records]);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-display flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            {sellerName}
          </span>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1">
              <DollarSign className="h-3 w-3" /> {fmt(stats.totalReceivable)}
            </Badge>
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200">
              <CheckCircle2 className="h-3 w-3" /> {fmt(stats.totalPaid)}
            </Badge>
            <Badge variant="outline" className="text-[10px] gap-1 text-yellow-600 border-yellow-200">
              <Clock className="h-3 w-3" /> {stats.pending}
            </Badge>
            {stats.overdue > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1 text-red-600 border-red-200">
                <AlertTriangle className="h-3 w-3" /> {stats.overdue}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isMobile ? (
          <div className="divide-y">
            {records.map(r => {
              const st = financialStatusLabels[r.financial_status] || financialStatusLabels.aguardando_pagamento;
              const pm = paymentMethodConfig[r.payment_method];
              return (
                <div key={r.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs truncate">{r.client_name || 'Sem cliente'}</span>
                    <Badge className={cn('text-[10px]', st.color)}>{st.label}</Badge>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{pm?.label || r.payment_method || '-'}</span>
                    <span>Venc: {r.due_date ? format(new Date(r.due_date), 'dd/MM/yyyy') : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{fmt(parseFloat(r.total_amount) || 0)}</span>
                    {canEdit && !['pago', 'cancelado'].includes(r.financial_status) && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onBaixa(r)}>
                        <ArrowDownCircle className="h-3 w-3 mr-1" /> Baixa
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Método</TableHead>
                <TableHead className="text-xs">Valor</TableHead>
                <TableHead className="text-xs">Vencimento</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Pago</TableHead>
                {canEdit && <TableHead className="text-xs">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(r => {
                const st = financialStatusLabels[r.financial_status] || financialStatusLabels.aguardando_pagamento;
                const pm = paymentMethodConfig[r.payment_method];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{r.client_name || 'Sem cliente'}</TableCell>
                    <TableCell className="text-xs">{pm?.label || r.payment_method || '-'}</TableCell>
                    <TableCell className="text-xs font-semibold">{fmt(parseFloat(r.total_amount) || 0)}</TableCell>
                    <TableCell className="text-xs">{r.due_date ? format(new Date(r.due_date), 'dd/MM/yyyy') : '-'}</TableCell>
                    <TableCell><Badge className={cn('text-[10px]', st.color)}>{st.label}</Badge></TableCell>
                    <TableCell className="text-xs">{r.amount_paid ? fmt(parseFloat(r.amount_paid)) : '-'}</TableCell>
                    {canEdit && (
                      <TableCell>
                        {!['pago', 'cancelado'].includes(r.financial_status) && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onBaixa(r)}>
                            <ArrowDownCircle className="h-3 w-3 mr-1" /> Baixa
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
