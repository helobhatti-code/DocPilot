export type ExpiryBand = 'valid' | '30d' | '14d' | '7d' | 'expired';

const SEVERITY: Record<ExpiryBand, number> = {
  valid: 0, '30d': 1, '14d': 2, '7d': 3, expired: 4,
};

/**
 * Compute expiry band from a date relative to today.
 * Returns null when date is null/undefined (field not applicable).
 */
export function computeExpiryBand(
  expiryDate: Date | null | undefined,
  today: Date = new Date(),
): ExpiryBand | null {
  if (!expiryDate) return null;
  const days = Math.ceil(
    (expiryDate.getTime() - today.setHours(0, 0, 0, 0)) / (24 * 3600 * 1000),
  );
  if (days < 0) return 'expired';
  if (days <= 7) return '7d';
  if (days <= 14) return '14d';
  if (days <= 30) return '30d';
  return 'valid';
}

/** Return the most urgent (highest severity) band from a list; defaults to 'valid'. */
export function worstBand(bands: (ExpiryBand | null)[]): ExpiryBand {
  const nonNull = bands.filter((b): b is ExpiryBand => b !== null);
  if (nonNull.length === 0) return 'valid';
  return nonNull.reduce(
    (worst, b) => (SEVERITY[b] > SEVERITY[worst] ? b : worst),
    'valid' as ExpiryBand,
  );
}
