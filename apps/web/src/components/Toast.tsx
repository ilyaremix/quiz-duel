import { Ball } from './Ball';
import { Icon, type IconGlyph } from './Icon';

export type ToastKind = 'success' | 'error' | 'info' | 'achievement';

const KINDS: Record<ToastKind, { color: string; ink: string; glow: string; glyph: IconGlyph }> = {
  success: { color: '#3BE58B', ink: '#04261A', glow: 'var(--qd-ok-glow)', glyph: 'check' },
  error: { color: '#FF5A7A', ink: '#2E0310', glow: 'var(--qd-bad-glow)', glyph: 'close' },
  info: { color: '#9B5CFF', ink: '#FFFFFF', glow: 'var(--qd-brand-glow)', glyph: 'info' },
  achievement: { color: '#FFD36B', ink: '#3A2600', glow: 'var(--qd-gold-glow)', glyph: 'medal' },
};

/**
 * Тост - плотная стеклянная капсула, иконка - глянцевый шар со свечением цвета типа.
 * У ачивки сверху подпись «Новая ачивка» золотом.
 */
export function Toast({ kind, text, title, glyph }: { kind: ToastKind; text: string; title?: string; glyph?: IconGlyph }) {
  const k = KINDS[kind];
  return (
    <div className="flex w-full justify-center">
      <div
        role="status"
        className="box-border flex min-h-[52px] max-w-full items-center gap-[11px] rounded-[26px] py-2 pr-[18px] pl-2"
        style={{
          background: 'var(--qd-toast)',
          color: 'var(--tg-theme-text-color)',
          boxShadow: 'var(--qd-glass-edge), 0 18px 40px rgba(3, 4, 20, 0.25)',
        }}
      >
        <Ball size={36} color={k.color} glow={k.glow} ink={k.ink}>
          <Icon glyph={glyph ?? k.glyph} size={18} stroke={3} />
        </Ball>
        <div className="flex min-w-0 flex-col gap-px">
          {title && (
            <span
              className="text-[11px] font-semibold tracking-[0.06em] uppercase"
              style={{ color: kind === 'achievement' ? 'var(--qd-gold-text)' : 'var(--tg-theme-hint-color)' }}
            >
              {title}
            </span>
          )}
          <span className="text-[15px] font-semibold">{text}</span>
        </div>
      </div>
    </div>
  );
}
