import { Icon, type IconGlyph } from './Icon';

/** Тон сферы: свечение снизу и цвет иконки. */
const TONES = {
  muted: { glow: 'rgba(170, 180, 255, 0.35)', fg: 'var(--tg-theme-text-color)' },
  brand: { glow: 'var(--qd-brand-glow)', fg: 'var(--qd-brand-text)' },
  gold: { glow: 'var(--qd-gold-glow)', fg: 'var(--qd-gold-text)' },
  wrong: { glow: 'var(--qd-bad-glow)', fg: 'var(--qd-wrong-text)' },
} as const;

export type NoticeTone = keyof typeof TONES;

interface NoticeProps {
  title: string;
  text: string;
  glyph?: IconGlyph;
  tone?: NoticeTone;
}

/** Блок «иконка + заголовок + текст» для заглушек и ошибок (экраны 23 и 24): стеклянная сфера со свечением тона, покачивается. */
export function Notice({ title, text, glyph, tone = 'muted' }: NoticeProps) {
  const t = TONES[tone];
  return (
    <div className="flex w-full flex-col items-center gap-2.5 text-center">
      {glyph && (
        <span
          aria-hidden="true"
          className="qd-bob mb-3 flex h-[104px] w-[104px] items-center justify-center rounded-full"
          style={{
            background: `linear-gradient(155deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.06) 55%), radial-gradient(circle at 50% 118%, ${t.glow}, rgba(0, 0, 0, 0) 64%), var(--qd-glass)`,
            boxShadow: `inset 0 1.5px 0 rgba(255, 255, 255, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 50px ${t.glow}, 0 18px 36px rgba(3, 4, 20, 0.3)`,
            color: t.fg,
          }}
        >
          <Icon glyph={glyph} size={44} stroke={2.4} />
        </span>
      )}
      <h1 className="m-0 text-[26px] leading-[1.15] font-bold tracking-[-0.02em]">{title}</h1>
      <p className="m-0 max-w-[300px] text-[15px] leading-[1.4] font-medium text-hint">{text}</p>
    </div>
  );
}
