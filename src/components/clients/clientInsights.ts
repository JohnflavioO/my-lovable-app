// Informações comerciais da lista de clientes — só leitura/apresentação.

export const INACTIVE_DAYS = 90;
const DAY = 86_400_000;

const OPEN_STATUSES = new Set(['draft', 'sent', 'pre_venda', 'pre_sale', 'contato_feito', 'contact_made', 'negociacao', 'negotiation']);

export type ClientSituation = 'no_quote' | 'negotiating' | 'customer' | 'inactive';

export const CLIENT_SITUATIONS: Record<ClientSituation, { label: string; className: string }> = {
  no_quote: { label: 'Sem orçamento', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' },
  negotiating: { label: 'Em negociação', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  customer: { label: 'Cliente', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  inactive: { label: 'Inativo', className: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
};

export interface QuoteLite {
  client_id?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  quote_date?: string | null;
  created_at?: string | null;
}

export interface ClientInsight {
  quotes: number;
  lastQuoteAt: number | null;
  wonValue: number;
  hasOpen: boolean;
  situation: ClientSituation;
}

const toTs = (q: QuoteLite): number | null => {
  const raw = q.quote_date || q.created_at;
  if (!raw) return null;
  const ts = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw).getTime();
  return Number.isNaN(ts) ? null : ts;
};

/**
 * Situação do cliente:
 * - sem orçamento: nenhum orçamento;
 * - inativo: último orçamento há mais de 90 dias (alvo de reativação);
 * - cliente: tem orçamento aprovado;
 * - em negociação: demais casos.
 */
export function situationOf(i: Omit<ClientInsight, 'situation'>, now = Date.now()): ClientSituation {
  if (i.quotes === 0) return 'no_quote';
  if (i.lastQuoteAt !== null && now - i.lastQuoteAt > INACTIVE_DAYS * DAY) return 'inactive';
  if (i.wonValue > 0) return 'customer';
  return 'negotiating';
}

export function buildClientInsights(quotes: QuoteLite[], now = Date.now()): Map<string, ClientInsight> {
  const acc = new Map<string, Omit<ClientInsight, 'situation'>>();
  for (const q of quotes) {
    if (!q.client_id) continue;
    const cur = acc.get(q.client_id) ?? { quotes: 0, lastQuoteAt: null, wonValue: 0, hasOpen: false };
    cur.quotes += 1;
    const ts = toTs(q);
    if (ts !== null && (cur.lastQuoteAt === null || ts > cur.lastQuoteAt)) cur.lastQuoteAt = ts;
    if (q.status === 'approved') cur.wonValue += Number(q.total_amount) || 0;
    if (q.status && OPEN_STATUSES.has(q.status)) cur.hasOpen = true;
    acc.set(q.client_id, cur);
  }
  const out = new Map<string, ClientInsight>();
  acc.forEach((v, k) => out.set(k, { ...v, situation: situationOf(v, now) }));
  return out;
}

export const EMPTY_INSIGHT: ClientInsight = { quotes: 0, lastQuoteAt: null, wonValue: 0, hasOpen: false, situation: 'no_quote' };

export const onlyDigits = (v?: string | null) => (v ?? '').replace(/\D/g, '');

/** CPF/CNPJ formatado só para exibição (o valor gravado não muda). */
export function formatDoc(v?: string | null): string {
  const d = onlyDigits(v);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return (v ?? '').trim();
}

/** Telefone brasileiro formatado só para exibição. */
export function formatPhone(v?: string | null): string {
  let d = onlyDigits(v);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return (v ?? '').trim();
}

/** Link do WhatsApp com DDI 55 quando o número não tem. */
export function whatsappLink(v?: string | null): string | null {
  let d = onlyDigits(v);
  if (d.length < 10) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}`;
}

/** Texto curto de tempo decorrido ("hoje", "há 12 dias", "há 3 meses"). */
export function timeAgo(ts: number | null, now = Date.now()): string {
  if (ts === null) return '—';
  const days = Math.floor((now - ts) / DAY);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

export const isIncomplete = (c: { phone?: string | null; email?: string | null }) =>
  onlyDigits(c.phone).length < 8 || !(c.email ?? '').includes('@');

/**
 * Cadastros com o mesmo CPF/CNPJ dentro da MESMA carteira (mesmo created_by).
 * O mesmo documento em carteiras de vendedores diferentes é permitido.
 */
export function samePortfolioDuplicates(clients: { id: string; created_by?: string | null; cpf_cnpj?: string | null }[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const c of clients) {
    const d = onlyDigits(c.cpf_cnpj);
    if (d.length < 11 || !c.created_by) continue;
    const key = `${c.created_by}|${d}`;
    const g = groups.get(key);
    if (g) g.push(c.id); else groups.set(key, [c.id]);
  }
  const dup = new Set<string>();
  groups.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => dup.add(id)); });
  return dup;
}

/** Procura outro cadastro com o mesmo documento na mesma carteira (para bloquear no salvar). */
export function findPortfolioDuplicate<T extends { id: string; created_by?: string | null; cpf_cnpj?: string | null }>(
  clients: T[], ownerId: string | null | undefined, doc: string | null | undefined, ignoreId?: string,
): T | undefined {
  const d = onlyDigits(doc);
  if (d.length < 11 || !ownerId) return undefined;
  return clients.find((c) => c.id !== ignoreId && c.created_by === ownerId && onlyDigits(c.cpf_cnpj) === d);
}
