import { Icon, type IconGlyph } from './Icon';

export type ToastKind = 'success' | 'error' | 'info' | 'achievement';

const KINDS: Record<ToastKind, { bg: string; fg: string; glyph: IconGlyph }> = {
  success: { bg: 'var(--qd-correct)', fg: 'var(--qd-on-fill)', glyph: 'check' },
  error: { bg: 'var(--qd-wrong)', fg: 'var(--qd-on-fill)', glyph: 'close' },
  info: { bg: 'var(--qd-brand)', fg: '#FFFFFF', glyph: 'info' },
  achievement: { bg: 'var(--qd-gold)', fg: '#2A1F05', glyph: 'medal' },
};

/** Тост: тёмная «таблетка» на светлой теме и наоборот (инверсные цвета), иконка по типу. */
export function Toast({ kind, text, glyph }: { kind: ToastKind; text: string; glyph?: IconGlyph }) {
  const k = KINDS[kind];
  return (
    <div className="flex w-full justify-center">
      <div
        role="status"
        className="box-border flex min-h-[52px] max-w-full items-center gap-2.5 rounded-[26px] py-2 pr-[18px] pl-2"
        style={{ background: 'var(--qd-inverse-bg)', color: 'var(--qd-inverse-text)', boxShadow: '0 10px 24px rgba(10, 8, 16, 0.28)' }}
      >
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: k.bg, color: k.fg }}>
          <Icon glyph={glyph ?? k.glyph} size={18} stroke={kind === 'achievement' ? 2.5 : 3} />
        </span>
        <span className="text-[15px] font-extrabold">{text}</span>
      </div>
    </div>
  );
}
