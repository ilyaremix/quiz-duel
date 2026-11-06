import { Icon, type IconGlyph } from './Icon';

const TONES = {
  muted: { bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-hint-color)' },
  brand: { bg: 'var(--qd-brand-tint)', fg: 'var(--qd-brand-text)' },
  gold: { bg: 'var(--qd-gold-tint)', fg: 'var(--qd-gold)' },
  wrong: { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong)' },
} as const;

export type NoticeTone = keyof typeof TONES;

interface NoticeProps {
  title: string;
  text: string;
  glyph?: IconGlyph;
  tone?: NoticeTone;
}

/** Блок «иконка + заголовок + текст» для заглушек и ошибок (экраны 23 и 24). */
export function Notice({ title, text, glyph, tone = 'muted' }: NoticeProps) {
  const t = TONES[tone];
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      {glyph && (
        <div className="mb-2.5 flex h-24 w-24 items-center justify-center rounded-full" style={{ background: t.bg, color: t.fg }}>
          <Icon glyph={glyph} size={44} stroke={2.5} />
        </div>
      )}
      <h1 className="m-0 text-[26px] leading-[1.15] font-black">{title}</h1>
      <p className="m-0 max-w-[300px] text-[15px] leading-[1.4] font-semibold text-hint">{text}</p>
    </div>
  );
}
