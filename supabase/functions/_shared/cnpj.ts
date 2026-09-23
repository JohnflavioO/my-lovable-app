// Shared CNPJ helpers (validation, normalization, BrasilAPI fetch).
// Used by: lookup-cnpj (CRM interno) and lookup-cnpj-public (landing Revenda MCI).

export const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

export function isValidCnpj(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((a, d, i) => a + Number(d) * weights[i], 0);
    const m = sum % 11;
    return m < 2 ? 0 : 11 - m;
  };
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${d1}${d2}`);
}

export function formatCep(raw: unknown) {
  const d = onlyDigits(raw);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : '';
}

export function formatPhone(raw: unknown) {
  const d = onlyDigits(raw);
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return '';
}

export interface CnpjCompany {
  cnpj: string;
  company_name: string;
  trade_name: string;
  status: string;
  opening_date: string;
  cep: string;
  street: string;
  address_number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  email: string;
}

/** Maps BrasilAPI payload to the public contract. Never exposes partners (QSA) or tax data. */
export function normalizeBrasilApiCompany(cnpj: string, d: Record<string, any>): CnpjCompany {
  return {
    cnpj,
    company_name: String(d.razao_social ?? '').trim(),
    trade_name: String(d.nome_fantasia ?? '').trim(),
    status: String(d.descricao_situacao_cadastral ?? '').trim(),
    opening_date: String(d.data_inicio_atividade ?? '').trim(),
    cep: formatCep(d.cep),
    street: String(d.logradouro ?? '').trim(),
    address_number: String(d.numero ?? '').trim(),
    complement: String(d.complemento ?? '').trim(),
    neighborhood: String(d.bairro ?? '').trim(),
    city: String(d.municipio ?? '').trim(),
    state: String(d.uf ?? '').trim().toUpperCase(),
    phone: formatPhone(d.ddd_telefone_1),
    email: String(d.email ?? '').trim().toLowerCase(),
  };
}

export async function fetchBrasilApiCnpj(cnpj: string, timeoutMs = 8000): Promise<
  { ok: true; data: Record<string, any> } | { ok: false; notFound?: boolean; status?: number }
> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'MCI-CRM-CNPJ-Lookup/1.0' },
    });
    if (r.status === 404) return { ok: false, notFound: true };
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(id);
  }
}
