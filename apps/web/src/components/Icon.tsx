/** Линейные иконки 24×24, обводка 2 px, скруглённые концы - как в дизайне. */
const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 8v5M12 16.5v.01M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z',
  retry: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
} as const;

export type IconGlyph = keyof typeof PATHS;

interface IconProps {
  glyph: IconGlyph;
  size?: number;
  stroke?: number;
}

export function Icon({ glyph, size = 22, stroke = 2 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={PATHS[glyph]} />
    </svg>
  );
}
