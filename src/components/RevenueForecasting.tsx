import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, TrendingUp, Send, Handshake, CalendarDays } from 'lucide-react';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type QuoteForecast = {
  approved_at?: string | null;
  created_at?: string | null;
  payment_status?: string | null;
  quote_date?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  updated_at?: string | null;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toTimestamp = (value?: string | null) => {
  if (!value) return null;
  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const ts = new Date(year, month - 1, day, 12, 0, 0).getTime();
    return Number.isNaN(ts) ? null : ts;
  }
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
};

const isClosedQuote = (quote: QuoteForecast) =>
  quote.status === 'approved' || quote.payment_status === 'liquidado';

const getQuoteCycleTimestamp = (quote: QuoteForecast) =>
  toTimestamp(quote.quote_date) ??
  toTimestamp(quote.created_at) ??
  toTimestamp(quote.approved_at) ??
  toTimestamp(quote.updated_at);

const getQuoteValue = (quote: QuoteForecast) => Number(quote.total_amount) || 0;

/** Generate billing cycles (21st to 20th) for the last 12 months + current */
function generateCycles(count = 13): { start: Date; end: Date; label: string; value: string }[] {
  const now = new Date();
  const cycles: { start: Date; end: Date; label: string; value: string }[] = [];

  for (let i = 0; i < count; i++) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    let start: Date, end: Date;

    if (now.getDate() >= 21 || i > 0) {
      start = new Date(ref.getFullYear(), ref.getMonth() - (i === 0 ? 0 : 0), 21, 0, 0, 0);
      end = new Date(ref.getFullYear(), ref.getMonth() + 1, 20, 23, 59, 59);
    } else {
      start = new Date(ref.getFullYear(), ref.getMonth() - 1, 21, 0, 0, 0);
      end = new Date(ref.getFullYear(), ref.getMonth(), 20, 23, 59, 59);
    }

    // For past cycles, calculate directly
    if (i > 0) {
      const baseMonth = now.getMonth() - i;
      const baseYear = now.getFullYear();
      if (now.getDate() >= 21) {
        start = new Date(baseYear, baseMonth, 21, 0, 0, 0);
        end = new Date(baseYear, baseMonth + 1, 20, 23, 59, 59);
      } else {
        start = new Date(baseYear, baseMonth - 1, 21, 0, 0, 0);
        end = new Date(baseYear, baseMonth, 20, 23, 59, 59);
      }
    }

    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${fmt(start)} - ${fmt(end)}`;
    const value = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;

    // Avoid duplicates
    if (!cycles.some(c => c.value === value)) {
      cycles.push({ start, end, label, value });
    }
  }

  return cycles;
}

/** Returns current billing cycle */
function getCurrentCycle(): { start: Date; end: Date; label: string; value: string } {
  const now = new Date();
  let start: Date, end: Date;
  if (now.getDate() >= 21) {
    start = new Date(now.getFullYear(), now.getMonth(), 21, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 20, 23, 59, 59);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 21, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), 20, 23, 59, 59);
  }
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { start, end, label: `${fmt(start)} - ${fmt(end)}`, value: `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}` };
}

interface Props {
  quotes: QuoteForecast[];
  onCardClick?: (label: string, quotes: QuoteForecast[]) => void;
}

export default function RevenueForecasting({ quotes, onCardClick }: Props) {
  const cycles = useMemo(() => generateCycles(13), []);
  const currentCycle = useMemo(() => getCurrentCycle(), []);
  const [selectedCycleValue, setSelectedCycleValue] = useState(currentCycle.value);

  const activeCycle = cycles.find(c => c.value === selectedCycleValue) || currentCycle;

  const cycleStart = activeCycle.start.getTime();
  const cycleEnd = activeCycle.end.getTime();

  const cycleQuotes = quotes.filter(quote => {
    const ts = getQuoteCycleTimestamp(quote);
    return ts !== null && ts >= cycleStart && ts <= cycleEnd;
  });

  const sent = cycleQuotes.filter(q => q.status === 'sent');
  const negotiation = cycleQuotes.filter(q => q.status === 'negociacao');
  const closed = cycleQuotes.filter(isClosedQuote);

  const sentValue = sent.reduce((s, q) => s + getQuoteValue(q), 0);
  const negotiationValue = negotiation.reduce((s, q) => s + getQuoteValue(q), 0);
  const closedValue = closed.reduce((s, q) => s + getQuoteValue(q), 0);

  const forecastValue = closedValue;

  const items = [
    { label: 'Em Negociação', value: negotiationValue, count: negotiation.length, icon: Handshake, color: 'text-amber-600', bg: 'bg-amber-100', quotes: negotiation },
    { label: 'Propostas Enviadas', value: sentValue, count: sent.length, icon: Send, color: 'text-blue-600', bg: 'bg-blue-100', quotes: sent },
    { label: 'Fechados no Ciclo', value: closedValue, count: closed.length, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-100', quotes: closed },
    { label: 'Previsão Final', value: forecastValue, count: closed.length + negotiation.length + sent.length, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10', quotes: cycleQuotes },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 flex-wrap">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0">Ciclo:</span>
        <Select value={selectedCycleValue} onValueChange={setSelectedCycleValue}>
          <SelectTrigger className="h-7 w-auto min-w-[150px] text-xs font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cycles.map(c => (
              <SelectItem key={c.value} value={c.value} className="text-xs">
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map(item => (
          <Card 
            key={item.label} 
            className={cn(
              "shadow-card transition-all duration-200 group",
              onCardClick ? "hover:shadow-elevated hover:border-primary/50 cursor-pointer active:scale-[0.98]" : ""
            )}
            onClick={() => onCardClick?.(item.label, item.quotes as any)}
          >
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                  <item.icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${item.color}`} />
                </div>
                <span className="text-[10px] md:text-xs text-muted-foreground ml-auto">{item.count} orç.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">{item.label}</p>
                {onCardClick && <span className="text-[9px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity hidden md:inline">Ver detalhes</span>}
              </div>
              <p className={`text-xs md:text-base font-bold ${item.color} truncate`}>{formatCurrency(item.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
