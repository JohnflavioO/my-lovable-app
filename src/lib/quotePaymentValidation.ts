/**
 * Validação central de forma de pagamento de orçamentos (CRM MCI).
 *
 * Fonte única de verdade usada por: formulário de orçamento, geração de PDF,
 * envio ao cliente, mudanças de status (Kanban / detalhes / negociações).
 * Espelhada no backend em supabase/functions/_shared/quotePayment.ts e na
 * trigger de banco public.validate_quote_payment().
 */

export const VALID_PAYMENT_METHODS = ['pix', 'cartao', 'boleto', 'parceria'] as const;
export type PaymentMethod = (typeof VALID_PAYMENT_METHODS)[number];

/** Status em que o orçamento PODE ficar incompleto. */
export const DRAFT_STATUSES = ['draft', 'rejected'];

/** Status comerciais que exigem pagamento válido. */
export const PAYMENT_REQUIRED_STATUSES = [
  'pre_venda',
  'contato_feito',
  'sent',
  'negociacao',
  'approved',
];

export const MAX_CARD_INSTALLMENTS = 10;
export const MAX_INSTALLMENTS = 24;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  cartao: 'Cartão de crédito',
  boleto: 'Boleto',
  parceria: 'Parceria',
};

/**
 * Parceria: permuta/parceria comercial. Não gera financeiro e não entra no
 * resultado (receita) do vendedor.
 */
export const NON_FINANCIAL_PAYMENT_METHODS = ['parceria'];

export const isPartnershipPayment = (quote: QuotePaymentInput | null | undefined): boolean => {
  if (!quote) return false;
  const m = (quote.payment_method || '').trim().toLowerCase();
  
  // Se for pagamento dividido, é considerado parceria apenas se AMBOS forem parceria.
  // (Embora na prática não faça sentido dividir parceria com outro método financeiro
  // para fins de exclusão de métricas, tratamos assim por segurança).
  if (quote.is_split_payment) {
    const m1 = (quote.split_method_1 || '').trim().toLowerCase();
    const m2 = (quote.split_method_2 || '').trim().toLowerCase();
    return NON_FINANCIAL_PAYMENT_METHODS.includes(m1) && NON_FINANCIAL_PAYMENT_METHODS.includes(m2);
  }
  
  return NON_FINANCIAL_PAYMENT_METHODS.includes(m);
};

export interface QuotePaymentInput {
  status?: string | null;
  payment_method?: string | null;
  payment_terms?: string | null;
  payment_date?: string | null;
  installments?: number | string | null;
  is_split_payment?: boolean | null;
  split_method_1?: string | null;
  split_value_1?: number | string | null;
  split_date_1?: string | null;
  split_installments_1?: number | string | null;
  split_method_2?: string | null;
  split_value_2?: number | string | null;
  split_date_2?: string | null;
  split_installments_2?: number | string | null;
  total_amount?: number | string | null;
}

export type PaymentErrorCode =
  | 'PAYMENT_METHOD_REQUIRED'
  | 'PAYMENT_TERMS_INCOMPLETE';

export interface PaymentValidationResult {
  valid: boolean;
  code?: PaymentErrorCode;
  /** Mensagem principal exibida ao usuário. */
  message?: string;
  /** Detalhe do que exatamente falta. */
  detail?: string;
  /** Campos envolvidos (para destacar no formulário). */
  fields: string[];
}

const num = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const isValidMethod = (m: any): m is PaymentMethod =>
  typeof m === 'string' && (VALID_PAYMENT_METHODS as readonly string[]).includes(m.trim().toLowerCase());

export const paymentRequiredForStatus = (status?: string | null) =>
  !!status && !DRAFT_STATUSES.includes(status);

const ok: PaymentValidationResult = { valid: true, fields: [] };

const fail = (
  code: PaymentErrorCode,
  detail: string,
  fields: string[],
): PaymentValidationResult => ({
  valid: false,
  code,
  message:
    code === 'PAYMENT_METHOD_REQUIRED'
      ? 'Informe uma forma de pagamento para continuar.'
      : 'Complete as condições da forma de pagamento selecionada.',
  detail,
  fields,
});

/**
 * Regra central. `total` permite validar contra o total calculado na tela
 * (itens + frete) em vez do total já gravado.
 */
export function validateQuotePaymentTerms(
  quote: QuotePaymentInput,
  total?: number,
): PaymentValidationResult {
  const grandTotal = total !== undefined ? total : num(quote.total_amount);

  // -------- Pagamento dividido --------
  if (quote.is_split_payment) {
    const m1 = (quote.split_method_1 || '').trim().toLowerCase();
    const m2 = (quote.split_method_2 || '').trim().toLowerCase();

    if (!isValidMethod(m1)) return fail('PAYMENT_METHOD_REQUIRED', 'Selecione o método 1 do pagamento dividido.', ['split_method_1']);
    if (!isValidMethod(m2)) return fail('PAYMENT_METHOD_REQUIRED', 'Selecione o método 2 do pagamento dividido.', ['split_method_2']);
    if (m1 === m2) return fail('PAYMENT_TERMS_INCOMPLETE', 'Os dois métodos de pagamento não podem ser iguais.', ['split_method_1', 'split_method_2']);

    const v1 = num(quote.split_value_1);
    const v2 = num(quote.split_value_2);
    if (v1 <= 0) return fail('PAYMENT_TERMS_INCOMPLETE', 'Informe o valor do método 1.', ['split_value_1']);
    if (v2 <= 0) return fail('PAYMENT_TERMS_INCOMPLETE', 'Informe o valor do método 2.', ['split_value_2']);

    if (grandTotal > 0 && Math.abs(v1 + v2 - grandTotal) > 0.01) {
      return fail(
        'PAYMENT_TERMS_INCOMPLETE',
        `A soma dos valores (${v1 + v2}) deve ser igual ao total do orçamento (${grandTotal}).`,
        ['split_value_1', 'split_value_2'],
      );
    }

    const sub1 = validateMethodConditions(m1, quote.split_date_1, quote.split_installments_1, '1');
    if (sub1) return sub1;
    const sub2 = validateMethodConditions(m2, quote.split_date_2, quote.split_installments_2, '2');
    if (sub2) return sub2;

    return ok;
  }

  // -------- Pagamento único --------
  const method = (quote.payment_method || '').trim().toLowerCase();
  if (!method || method === 'selecione' || !isValidMethod(method)) {
    return fail('PAYMENT_METHOD_REQUIRED', 'Selecione uma forma de pagamento válida (PIX, Cartão ou Boleto).', ['payment_method']);
  }

  const sub = validateMethodConditions(method, quote.payment_date, quote.installments);
  if (sub) return sub;

  return ok;
}

function validateMethodConditions(
  method: string,
  date: any,
  installments: any,
  splitIdx?: '1' | '2',
): PaymentValidationResult | null {
  const suffix = splitIdx ? ` (método ${splitIdx})` : '';
  const dateField = splitIdx ? `split_date_${splitIdx}` : 'payment_date';
  const instField = splitIdx ? `split_installments_${splitIdx}` : 'installments';
  const parcelas = Math.floor(num(installments));

  if (method === 'pix') {
    if (!date) return fail('PAYMENT_TERMS_INCOMPLETE', `Informe a data do pagamento PIX${suffix}.`, [dateField]);
    return null;
  }

  if (method === 'boleto') {
    if (parcelas < 1) return fail('PAYMENT_TERMS_INCOMPLETE', `Informe a quantidade de parcelas do boleto${suffix}.`, [instField]);
    if (parcelas > MAX_INSTALLMENTS) return fail('PAYMENT_TERMS_INCOMPLETE', `O boleto${suffix} permite no máximo ${MAX_INSTALLMENTS} parcelas.`, [instField]);
    if (!date) return fail('PAYMENT_TERMS_INCOMPLETE', `Informe o vencimento inicial do boleto${suffix}.`, [dateField]);
    return null;
  }

  if (method === 'cartao') {
    if (parcelas < 1) return fail('PAYMENT_TERMS_INCOMPLETE', `Informe o número de parcelas do cartão${suffix}.`, [instField]);
    if (parcelas > MAX_CARD_INSTALLMENTS) {
      return fail('PAYMENT_TERMS_INCOMPLETE', `O cartão de crédito permite no máximo ${MAX_CARD_INSTALLMENTS} parcelas${suffix}.`, [instField]);
    }
    return null;
  }

  return null;
}

/** Resumo legível para revisão antes de enviar/aprovar. */
export function describeQuotePayment(quote: QuotePaymentInput): string {
  const fmtDate = (d?: string | null) => {
    if (!d) return '';
    const [y, m, day] = String(d).slice(0, 10).split('-');
    return y && m && day ? `${day}/${m}/${y}` : String(d);
  };
  const part = (m?: string | null, date?: string | null, inst?: any) => {
    const label = PAYMENT_METHOD_LABELS[String(m)] || '—';
    const n = Math.floor(num(inst));
    if (m === 'pix') return `${label}${date ? ` — ${fmtDate(date)}` : ''}`;
    if (m === 'boleto') return `${label} — ${n || 1}x${date ? ` a partir de ${fmtDate(date)}` : ''}`;
    if (m === 'cartao') return `${label} — ${n || 1}x`;
    return label;
  };

  if (quote.is_split_payment) {
    return `Dois métodos: ${part(quote.split_method_1, quote.split_date_1, quote.split_installments_1)} + ${part(quote.split_method_2, quote.split_date_2, quote.split_installments_2)}`;
  }
  if (!quote.payment_method) return 'Pagamento pendente de regularização';
  return part(quote.payment_method, quote.payment_date, quote.installments);
}

/** Usada em listas para marcar orçamentos legados incompletos. */
export function isQuotePaymentPending(quote: QuotePaymentInput): boolean {
  if (!paymentRequiredForStatus(quote.status)) return false;
  return !validateQuotePaymentTerms(quote).valid;
}
