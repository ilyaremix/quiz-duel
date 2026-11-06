import { Icon, type IconGlyph } from './Icon';

const TONES = {
  brand: { bg: 'var(--qd-brand-tint)', fg: 'var(--qd-brand-text)' },
  wrong: { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong-text)' },
  gold: { bg: 'var(--qd-gold-tint)', fg: 'var(--qd-gold-text)' },
} as const;

interface NoticeProps {
  title: string;
  text: string;
  glyph?: IconGlyph;
  tone?: keyof typeof TONES;
}

/** Блок «иконка + заголовок + текст» для заглушек и пустых состояний. */
export function Notice({ title, text, glyph, tone = 'brand' }: NoticeProps) {
  const t = TONES[tone];
  return (
    <div className="flex flex-col items-center gap-4 px-2 text-center">
      {glyph && (
        <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: t.bg, color: t.fg }}>
          <Icon glyph={glyph} size={36} stroke={2.4} />
        </div>
      )}
      <h1 className="m-0 text-[28px] font-black leading-tight">{title}</h1>
      <p className="m-0 max-w-[320px] text-[15px] font-semibold leading-snug text-hint">{text}</p>
    </div>
  );
}
