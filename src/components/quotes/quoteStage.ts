// Etapa visual de um orçamento na lista — só apresentação, não altera dados.
// Em negociação → Aprovado → No faturamento → Liquidado (Rejeitado fica à parte).

export type QuoteStageKey = 'negotiation' | 'approved' | 'billing' | 'settled' | 'rejected';

export interface QuoteStage {
  key: QuoteStageKey;
  /** 0 = rejeitado; 1..4 = posição no progresso */
  step: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** cor da barra lateral e dos passos preenchidos */
  barClass: string;
  /** cor do texto da etapa */
  textClass: string;
}

export const QUOTE_STAGES: Record<QuoteStageKey, QuoteStage> = {
  negotiation: { key: 'negotiation', step: 1, label: 'Em negociação', barClass: 'bg-blue-600', textClass: 'text-blue-700 dark:text-blue-300' },
  approved: { key: 'approved', step: 2, label: 'Aprovado', barClass: 'bg-green-600', textClass: 'text-green-700 dark:text-green-300' },
  billing: { key: 'billing', step: 3, label: 'No faturamento', barClass: 'bg-amber-600', textClass: 'text-amber-700 dark:text-amber-300' },
  settled: { key: 'settled', step: 4, label: 'Liquidado', barClass: 'bg-emerald-700', textClass: 'text-emerald-800 dark:text-emerald-300' },
  rejected: { key: 'rejected', step: 0, label: 'Rejeitado', barClass: 'bg-slate-400', textClass: 'text-slate-600 dark:text-slate-400' },
};

/** Legenda exibida acima da tabela (sem "Rejeitado", que tem filtro próprio). */
export const QUOTE_STAGE_LEGEND: QuoteStage[] = [
  QUOTE_STAGES.negotiation,
  QUOTE_STAGES.approved,
  QUOTE_STAGES.billing,
  QUOTE_STAGES.settled,
];

export function getQuoteStage(q: {
  status?: string | null;
  payment_status?: string | null;
  billing_sent_at?: string | null;
}): QuoteStage {
  if (q?.billing_sent_at) {
    return q.payment_status === 'liquidado' ? QUOTE_STAGES.settled : QUOTE_STAGES.billing;
  }
  if (q?.status === 'rejected') return QUOTE_STAGES.rejected;
  if (q?.status === 'approved') return QUOTE_STAGES.approved;
  return QUOTE_STAGES.negotiation;
}

/** Iniciais para o avatar do responsável ("John Flavio" → "JF"). */
export function sellerInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
