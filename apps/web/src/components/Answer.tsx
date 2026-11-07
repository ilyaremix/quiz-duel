import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type AnswerState = 'default' | 'selected' | 'dimmed' | 'correct' | 'wrong';

const CHIP = 'var(--qd-chip)';
const CHIP_EDGE = 'inset 0 1px 0 rgba(255, 255, 255, 0.38), inset 0 0 0 1px rgba(255, 255, 255, 0.12)';
const BASE = {
  bg: 'var(--qd-sheen), var(--qd-glass)',
  edge: 'var(--qd-glass-edge-flat)',
  op: 1,
  glyph: undefined,
  icBg: CHIP,
  icFg: 'var(--tg-theme-text-color)',
  icEdge: CHIP_EDGE,
};

const LOOK: Record<
  AnswerState,
  { bg: string; edge: string; op: number; glyph: 'check' | 'close' | undefined; icBg: string; icFg: string; icEdge: string }
> = {
  default: BASE,
  selected: {
    bg: 'var(--qd-me-glass)',
    edge: 'var(--qd-me-edge)',
    op: 1,
    glyph: undefined,
    icBg: '#4F8DFF',
    icFg: '#FFFFFF',
    icEdge: 'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
  },
  dimmed: { ...BASE, op: 0.4 },
  correct: {
    bg: 'var(--qd-ok-glass)',
    edge: 'var(--qd-ok-edge)',
    op: 1,
    glyph: 'check',
    icBg: 'var(--qd-correct)',
    icFg: '#04261A',
    icEdge: 'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
  },
  wrong: {
    bg: 'var(--qd-bad-glass)',
    edge: 'var(--qd-bad-edge)',
    op: 1,
    glyph: 'close',
    icBg: 'var(--qd-wrong)',
    icFg: '#2E0310',
    icEdge: 'inset 0 1px 0 rgba(255, 255, 255, 0.45)',
  },
};

type Mark = { id: number; name: string; photoUrl?: string | null };

interface AnswerProps {
  text: string;
  state?: AnswerState;
  /** Буква варианта A-D в кружке слева; на раскрытии вместо неё - ✓ / ✕. */
  letter?: string;
  disabled?: boolean;
  points?: string;
  /** Мини-аватарки на выбранном варианте (раскрытие). */
  me?: Mark;
  opp?: Mark;
  onPress?: () => void;
}

/**
 * Вариант ответа - стеклянная капсула от 64 px. Выбор - синее стекло со свечением, верно / неверно -
 * зелёное / красное с иконкой ✓ / ✕ (верность не только цветом). При нажатии вариант сразу синеет.
 */
export function Answer({ text, state = 'default', letter = '', disabled = false, points, me, opp, onPress }: AnswerProps) {
  const { t } = useTranslation();
  const m = LOOK[state];
  const circle = Boolean(m.glyph || letter);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className="qd-press qd-ans box-border flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-[32px] border-0 py-2.5 pr-4 text-left text-[17px] leading-[1.25] font-semibold"
      style={{
        paddingLeft: circle ? 10 : 18,
        background: m.bg,
        boxShadow: m.edge,
        color: 'var(--tg-theme-text-color)',
        opacity: disabled && state === 'default' ? 0.4 : m.op,
        transition:
          'transform var(--qd-dur-press) var(--qd-ease-ui), color 200ms ease, box-shadow 200ms ease, opacity 200ms ease, filter 160ms ease',
      }}
    >
      {circle && (
        <span
          role="img"
          aria-label={m.glyph ? t(m.glyph === 'check' ? 'answer.correct' : 'answer.wrong') : letter}
          className="qd-ans-ic flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
          style={{
            background: m.icBg,
            color: m.icFg,
            boxShadow: m.icEdge,
            transition: 'background-color 200ms ease, color 200ms ease',
          }}
        >
          {m.glyph ? <Icon glyph={m.glyph} size={18} stroke={3} /> : letter}
        </span>
      )}
      <span className="min-w-0 grow">{text}</span>
      {points && (
        <span
          className="qd-pop qd-num flex h-7 shrink-0 items-center rounded-[14px] px-2.5 text-[14px] font-bold"
          style={{ background: 'var(--qd-chip)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.35)' }}
        >
          {points}
        </span>
      )}
      {(me || opp) && (
        <span className="flex shrink-0 items-center gap-1.5">
          {me && (
            <span role="img" aria-label={t('answer.mine')} className="qd-pop flex">
              <Avatar id={me.id} name={me.name} photoUrl={me.photoUrl} size={26} ring="me" on="none" />
            </span>
          )}
          {opp && (
            <span role="img" aria-label={t('answer.opp')} className="qd-pop flex">
              <Avatar id={opp.id} name={opp.name} photoUrl={opp.photoUrl} size={26} ring="opp" on="none" />
            </span>
          )}
        </span>
      )}
    </button>
  );
}
