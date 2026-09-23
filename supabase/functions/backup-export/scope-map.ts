export const EXCLUDED_TABLES = new Set(['backup_audit_log','cnpj_lookup_cache','equivalence_search_cache','reseller_rate_limit']);
export const GLOBAL_TABLES = new Set(['app_changelog','help_videos','integrations','reseller_consultant_history','reseller_consultants','reseller_registration_history','reseller_registrations','salespeople','system_settings','technical_brands']);
export const STORAGE_BUCKETS = ['avatars','quote-pdfs','nf-pdfs','contracts','technical-cloud','budget-proofs','help-thumbnails','contract-signed','contract-evidence'] as const;
export type Cursor = { created_at: string | null; key: string } | null;
export function normalizeLimit(value: unknown) { const n=Number(value); return Number.isFinite(n) ? Math.max(1,Math.min(500,Math.trunc(n))) : 500; }
export function assertKnownTable(table:string, known:string[]) { if(!known.includes(table) || EXCLUDED_TABLES.has(table)) throw new Error(`tabela ${table} sem regra de empresa`); }
