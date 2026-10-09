/** Editing a proposal does not reassign its seller unless explicitly changed. */
export function resolveQuoteSellerId(
  existing: { salesperson?: string | null; salesperson_id?: string | null } | null,
  selectedName: string,
  matchedSellerId: string | null | undefined,
  currentUserId: string | null | undefined,
): string | null {
  if (existing && (existing.salesperson || '') === selectedName) {
    return existing.salesperson_id ?? null;
  }
  return matchedSellerId || currentUserId || null;
}