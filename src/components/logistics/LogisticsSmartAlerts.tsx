import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, FileText, Truck, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface LogisticsRecord {
  id: string;
  logistics_status: string;
  nf_numero: string | null;
  codigo_rastreio: string | null;
  data_envio: string | null;
  created_at: string;
  updated_at: string;
  quote_number?: string;
  client_name?: string;
}

interface SmartAlertsProps {
  records: LogisticsRecord[];
  onSelectRecord?: (record: LogisticsRecord) => void;
}

interface AlertGroup {
  icon: any;
  color: string;
  message: string;
  records: LogisticsRecord[];
}

export default function LogisticsSmartAlerts({ records, onSelectRecord }: SmartAlertsProps) {
  const now = new Date();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const staleOrders = records.filter(r => {
    if (['entregue', 'problema_logistico'].includes(r.logistics_status)) return false;
    const days = differenceInDays(now, new Date(r.updated_at));
    return days >= 3;
  });

  const nfNotSent = records.filter(r =>
    r.logistics_status === 'nf_emitida' && r.nf_numero &&
    differenceInDays(now, new Date(r.updated_at)) >= 2
  );

  const sentNoTracking = records.filter(r =>
    ['enviado', 'em_transporte'].includes(r.logistics_status) && !r.codigo_rastreio
  );

  const alerts: AlertGroup[] = [
    ...(staleOrders.length > 0 ? [{
      icon: Clock,
      color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      message: `${staleOrders.length} pedido(s) parado(s) há 3+ dias sem atualização`,
      records: staleOrders,
    }] : []),
    ...(nfNotSent.length > 0 ? [{
      icon: FileText,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      message: `${nfNotSent.length} pedido(s) com NF emitida mas ainda não enviado(s)`,
      records: nfNotSent,
    }] : []),
    ...(sentNoTracking.length > 0 ? [{
      icon: Truck,
      color: 'text-orange-600 bg-orange-50 border-orange-200',
      message: `${sentNoTracking.length} pedido(s) enviado(s) sem código de rastreio`,
      records: sentNoTracking,
    }] : []),
  ];

  if (alerts.length === 0) return null;

  const toggleExpand = (idx: number) => {
    setExpandedIndex(prev => prev === idx ? null : idx);
  };

  return (
    <Card className="border-yellow-200 bg-yellow-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          Alertas Inteligentes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert, i) => {
          const Icon = alert.icon;
          const isExpanded = expandedIndex === i;
          return (
            <div key={i} className="space-y-1">
              <button
                onClick={() => toggleExpand(i)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border ${alert.color} cursor-pointer hover:opacity-90 transition-opacity`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium flex-1 text-left">{alert.message}</span>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 shrink-0 opacity-60" />
                  : <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                }
              </button>
              {isExpanded && (
                <div className="pl-2 space-y-1">
                  {alert.records.map(r => (
                    <button
                      key={r.id}
                      onClick={() => onSelectRecord?.(r)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-background border text-sm hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{r.quote_number || 'Sem número'}</span>
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                          {r.client_name || ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          {differenceInDays(now, new Date(r.updated_at))}d parado
                        </Badge>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
