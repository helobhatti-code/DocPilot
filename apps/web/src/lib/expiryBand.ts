export type ExpiryBand = 'valid' | '30d' | '14d' | '7d' | 'expired' | null;

interface BandStyle {
  bg:    string;
  text:  string;
  label: string;
}

export const BAND_STYLE: Record<Exclude<ExpiryBand, null>, BandStyle> = {
  valid:   { bg: 'bg-emerald-400/10', text: 'text-emerald-400', label: 'Valid' },
  '30d':   { bg: 'bg-yellow-400/10',  text: 'text-yellow-400',  label: 'Alarm in 30 Days' },
  '14d':   { bg: 'bg-orange-400/10',  text: 'text-orange-400',  label: 'Alarm in 14 Days' },
  '7d':    { bg: 'bg-rose-500/10',    text: 'text-rose-500',    label: 'Alarm in 7 Days' },
  expired: { bg: 'bg-rose-700/10',    text: 'text-rose-700',    label: 'Expired' },
};

export function bandStyle(band: ExpiryBand): BandStyle {
  if (!band) return { bg: 'bg-transparent', text: 'text-text-secondary', label: '—' };
  return BAND_STYLE[band];
}
