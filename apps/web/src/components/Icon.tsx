/** Линейные иконки 24×24, скруглённые концы - пути из компонента Icon в дизайне. */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  rating: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  profile: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  settings:
    'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4M10 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M18 16a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 11.5v1',
  duel: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
  check: 'm5 12 5 5L20 7',
  close: 'M6 6l12 12M18 6 6 18',
  share: 'M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  rematch: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  retry: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  copy: 'M10 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M12 20h.01M5 12.5a10 10 0 0 1 4-2.3M19 12.5a10 10 0 0 0-3-1.9',
  leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l8-8',
  medal: 'M12 9a6 6 0 1 0 0 12a6 6 0 1 0 0-12M8.5 10.5 6 3h4l2 4 2-4h4l-2.5 7.5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v5M12 8h.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  ball: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7l4 3-1.5 4.5h-5L8 10zM12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5 7 18.5M8 10 3.5 8.5',
  chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  chevron: 'm9 6 6 6-6 6',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
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
