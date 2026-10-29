// Oyster size categories and processing statuses.
// The colours are the owner's choice: spat red, small green, large white,
// market size purple, extra large orange. The name is always shown next to the
// colour, and `letter` marks map cells for colour-blind use.

export const SIZES = ['spat', 'small', 'large', 'market', 'xl'] as const;
export type Size = (typeof SIZES)[number];

export interface SizeInfo {
  label: string;
  letter: string;
  color: string;
  textColor: string;
}

export const SIZE_INFO: Record<Size, SizeInfo> = {
  spat:   { label: 'Спат',             letter: 'С', color: '#DC2626', textColor: '#FFFFFF' },
  small:  { label: 'Малки',            letter: 'М', color: '#16A34A', textColor: '#FFFFFF' },
  large:  { label: 'Големи',           letter: 'Г', color: '#FACC15', textColor: '#111827' },
  market: { label: 'Търговски размер', letter: 'Т', color: '#7E22CE', textColor: '#FFFFFF' },
  xl:     { label: 'Едри',             letter: 'Е', color: '#EA580C', textColor: '#FFFFFF' },
};

export const STATUSES = ['on_land', 'newly_sorted', 'sorted'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  on_land: 'На суша',
  newly_sorted: 'Новосортирана',
  sorted: 'Сортирана',
};

/** Suggested archive reasons; free text is also allowed. */
export const ARCHIVE_REASONS = ['Изгубена', 'Повредена', 'Изведена от употреба'] as const;

export function isSize(v: unknown): v is Size {
  return typeof v === 'string' && (SIZES as readonly string[]).includes(v);
}
export function isStatus(v: unknown): v is Status {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}
