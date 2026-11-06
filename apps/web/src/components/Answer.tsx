import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type AnswerState = 'default' | 'selected' | 'dimmed' | 'correct' | 'wrong';

const LOOK: Record<AnswerState, { bg: string; fg: string; lip: string; op: number; glyph?: 'check' | 'close' }> = {
  default: { bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-text-color)', lip: 'var(--qd-lip)', op: 1 },
  selected: { bg: 'var(--qd-me)', fg: '#FFFFFF', lip: 'var(--qd-me-lip)', op: 1 },
  dimmed: { bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-text-color)', lip: 'var(--qd-lip)', op: 0.4 },
  correct: { bg: 'var(--qd-correct)', fg: 'var(--qd-on-fill)', lip: 'var(--qd-correct-lip)', op: 1, glyph: 'check' },
  wrong: { bg: 'var(--qd-wrong)', fg: 'var(--qd-on-fill)', lip: 'var(--qd-wrong-lip)', op: 1, glyph: 'close' },
};

type Mark = { id: number; name: string; photoUrl?: string | null };

interface AnswerProps {
  text: string;
  state?: AnswerState;
  disabled?: boolean;
  points?: string;
  /** Мини-аватарки на выбранном варианте (раскрытие). */
  me?: Mark;
  opp?: Mark;
  onPress?: () => void;
}

/** Вариант ответа во всю ширину, от 56 px; верность дублируется иконкой ✓ / ✕. */
export function Answer({ text, state = 'default', disabled = false, points, me, opp, onPress }: AnswerProps) {
  const { t } = useTranslation();
  const m = LOOK[state];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className="qd-press box-border flex min-h-[60px] w-full cursor-pointer items-center gap-2.5 rounded-[18px] border-0 py-3 pr-3.5 pl-[18px] text-left font-[inherit] text-[17px] leading-[1.25] font-extrabold"
      style={{
        background: m.bg,
        color: m.fg,
        '--qd-shadow': `0 4px 0 ${m.lip}`,
        '--qd-lip-color': m.lip,
        opacity: disabled ? 0.4 : m.op,
      } as CSSProperties}
    >
      {m.glyph && (
        <span
          role="img"
          aria-label={t(m.glyph === 'check' ? 'answer.correct' : 'answer.wrong')}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgba(20, 16, 28, 0.16)' }}
        >
          <Icon glyph={m.glyph} size={16} stroke={3} />
        </span>
      )}
      <span className="grow">{text}</span>
      {points && (
        <span className="qd-num flex h-[26px] shrink-0 items-center rounded-[13px] px-[9px] text-[14px]" style={{ background: 'rgba(20, 16, 28, 0.16)' }}>
          {points}
        </span>
      )}
      {(me || opp) && (
        <span className="flex shrink-0 items-center gap-1.5">
          {me && (
            <span role="img" aria-label={t('answer.mine')} className="flex">
              <Avatar id={me.id} name={me.name} photoUrl={me.photoUrl} size={26} ring="me" on="none" />
            </span>
          )}
          {opp && (
            <span role="img" aria-label={t('answer.opp')} className="flex">
              <Avatar id={opp.id} name={opp.name} photoUrl={opp.photoUrl} size={26} ring="opp" on="none" />
            </span>
          )}
        </span>
      )}
    </button>
  );
}
