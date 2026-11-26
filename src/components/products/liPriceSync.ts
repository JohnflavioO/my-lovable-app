// Regras da atualização de preços pela Loja Integrada (só cálculo, sem acesso a dados).

export type PriceMode = 'final' | 'list';

export interface LiSnapshot {
  product_id: string;
  preco_cheio: number | null;
  preco_promocional: number | null;
  sob_consulta: boolean;
  error: string | null;
}

export type RowStatus = 'change' | 'same' | 'unavailable' | 'suspicious';

/** Promoção válida: "Por" maior que zero e menor que o "De". */
export const hasPromo = (s: Pick<LiSnapshot, 'preco_cheio' | 'preco_promocional'>) =>
  (s.preco_promocional ?? 0) > 0 && (s.preco_cheio ?? 0) > 0 && (s.preco_promocional as number) < (s.preco_cheio as number);

/** Valor que seria aplicado (mesma regra de apply_li_prices no banco). */
export function targetPrice(s: LiSnapshot, mode: PriceMode): number | null {
  if (s.error || s.sob_consulta || !((s.preco_cheio ?? 0) > 0)) return null;
  return mode === 'final' && hasPromo(s) ? (s.preco_promocional as number) : (s.preco_cheio as number);
}

export const promoPercent = (s: Pick<LiSnapshot, 'preco_cheio' | 'preco_promocional'>) =>
  hasPromo(s) ? Math.round((1 - (s.preco_promocional as number) / (s.preco_cheio as number)) * 100) : 0;

/** Variação acima disso sugere produto ligado ao item errado na loja. */
export const SUSPICIOUS_CHANGE = 0.5;

export function rowStatus(s: LiSnapshot, crmPrice: number, mode: PriceMode): RowStatus {
  const t = targetPrice(s, mode);
  if (t === null) return 'unavailable';
  if (Math.abs(t - crmPrice) < 0.005) return 'same';
  if (crmPrice > 0 && Math.abs(t - crmPrice) / crmPrice > SUSPICIOUS_CHANGE) return 'suspicious';
  return 'change';
}

export function unavailableReason(s: LiSnapshot): string {
  if (s.error === 'http_404') return 'Não existe mais na loja';
  if (s.error) return 'Erro ao consultar a loja';
  if (s.sob_consulta) return 'Preço sob consulta na loja';
  return 'Sem preço na loja (produto com variações?)';
}

/** "Iluminação › LED" a partir da árvore de categorias da loja. */
export function categoryPath(id: string, byId: Map<string, { nome: string; parent_id: string | null }>): string {
  const parts: string[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && byId.has(cur) && !seen.has(cur) && parts.length < 5) {
    seen.add(cur);
    const c = byId.get(cur)!;
    parts.unshift(c.nome);
    cur = c.parent_id;
  }
  return parts.join(' › ') || `Categoria ${id}`;
}

// ---------- Conferência de identidade (CRM × loja) ----------
// O código/SKU sozinho não basta: há códigos reaproveitados na loja para outro
// item (ex.: "MC PRO 8-Light Kit" × "Pacote de acessórios MC Kit"). E o nome
// sozinho também erra ("RAY 60C" × "Ray 660c"). Exigimos as duas coisas.

const NOISE = /\b(pre[\s-]?venda|lancamento|promocao|oferta|novo)\b/g;

export function normalizeProductName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, ' $1 ')
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Números de modelo do nome: termos com dígito e 2+ caracteres ("60c", "p600c", "m98s"). */
export function modelTokens(name: string | null | undefined): Set<string> {
  return new Set(normalizeProductName(name).split(' ').filter((t) => t.length >= 2 && /\d/.test(t)));
}

function bigrams(s: string) {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    m.set(bg, (m.get(bg) || 0) + 1);
  }
  return m;
}

/** Semelhança de Dice (0..1) entre nomes normalizados. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = normalizeProductName(a), y = normalizeProductName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const ba = bigrams(x), bb = bigrams(y);
  let hits = 0;
  ba.forEach((v, k) => { const w = bb.get(k); if (w) hits += Math.min(v, w); });
  return (2 * hits) / (x.length - 1 + y.length - 1);
}

export const MIN_NAME_SIMILARITY = 0.55;

/** Todos os números de modelo do CRM aparecem no nome da loja e os nomes são parecidos. */
export function namesCompatible(crmName: string | null | undefined, storeName: string | null | undefined): boolean {
  if (!storeName) return false;
  const store = modelTokens(storeName);
  for (const t of modelTokens(crmName)) if (!store.has(t)) return false;
  return nameSimilarity(crmName, storeName) >= MIN_NAME_SIMILARITY;
}

export type LinkTrust = 'confirmed' | 'verified' | 'check';

/**
 * confirmed: uma pessoa confirmou que é o mesmo item;
 * verified: código igual ao SKU da loja E nome/modelo compatíveis;
 * check: precisa de confirmação antes de puxar o preço.
 */
export function linkTrust(opts: { confirmed: boolean; codeMatches: boolean; crmName: string; storeName: string | null }): LinkTrust {
  if (opts.confirmed) return 'confirmed';
  if (opts.codeMatches && namesCompatible(opts.crmName, opts.storeName)) return 'verified';
  return 'check';
}
