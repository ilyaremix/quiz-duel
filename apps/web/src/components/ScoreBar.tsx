import { useTranslation } from 'react-i18next';
import type { GlowId } from '@quiz-duel/shared';
import { Avatar, type AvatarBadge } from './Avatar';
import { Ball, BALLS } from './Ball';
import { Icon } from './Icon';

export interface ScoreSide {
  id: number;
  name: string;
  photoUrl: string | null;
  /** Уже отформатированный счёт («2 340»). */
  score: string;
  glow?: GlowId;
}

interface ScoreBarProps {
  me: ScoreSide;
  opp: ScoreSide | null;
  /** Номер текущего вопроса с 1. */
  current: number;
  total: number;
  /** answered - соперник ответил (без варианта), offline - не в сети. */
  oppState: 'none' | 'answered' | 'offline';
  meState: 'none' | 'answered';
  /** Тренировка: справа вместо соперника - рекорд категории (уже отформатирован; «-» если нет). */
  best?: string;
  /** Очки за вопрос взлетают у счёта на раскрытии («+870»). */
  meGain?: string;
  oppGain?: string;
  /** Строку «соперник ответил» показывает сам экран (живая зона на экране вопроса). */
  hideNote?: boolean;
}

const SCORE = 'qd-num text-[22px] leading-[1.15] font-bold tracking-[-0.02em] whitespace-nowrap';
const GAIN = 'qd-float qd-num pointer-events-none absolute -top-4 text-[16px] font-bold';

/**
 * Счёт партии сверху: я слева (синий), соперник справа (оранжевый). Пройденные вопросы - светлые точки,
 * текущий - градиентная капсула со свечением, впереди - пунктир; под точками «3/10».
 */
export function ScoreBar({ me, opp, current, total, oppState, meState, best, meGain, oppGain, hideNote = false }: ScoreBarProps) {
  const { t } = useTranslation();
  const oppBadge: AvatarBadge = oppState === 'answered' ? 'answered' : oppState === 'offline' ? 'offline' : 'none';
  const oppName = opp?.name || t('score.opp');
  const note = oppState === 'answered' ? t('score.answered', { opp: oppName }) : oppState === 'offline' ? t('score.offline') : '';
  const off = oppState === 'offline';

  return (
    <section aria-label={t('score.aria')} className="flex w-full flex-col gap-0.5">
      <div className="flex min-h-[58px] items-center gap-2">
        <div className="relative flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar id={me.id} name={me.name} photoUrl={me.photoUrl} size={46} ring="me" badge={meState === 'answered' ? 'answered' : 'none'} glow={me.glow} />
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-hint">{t('common.you')}</span>
            <span className={SCORE} style={{ color: 'var(--qd-me-text)', textShadow: '0 0 16px var(--qd-me-glow)' }}>
              {me.score}
            </span>
          </div>
          {meGain && (
            <span key={meGain} aria-hidden="true" className={`${GAIN} left-[58px]`} style={{ color: 'var(--qd-me-text)', textShadow: '0 0 14px var(--qd-me-glow)' }}>
              {meGain}
            </span>
          )}
        </div>
        <div className="flex flex-col items-center gap-[7px]">
          <div aria-hidden="true" className="flex items-center gap-1">
            {Array.from({ length: total }, (_, i) => {
              const n = i + 1;
              const on = n === current;
              return (
                <span
                  key={n}
                  className="qd-dot h-1.5 rounded-[3px]"
                  style={{
                    width: on ? 18 : 6,
                    background: on ? 'linear-gradient(90deg, #4F8DFF, #9B5CFF)' : n < current ? 'var(--tg-theme-hint-color)' : 'var(--qd-dash)',
                    boxShadow: on ? '0 0 10px rgba(155, 92, 255, 0.8)' : 'none',
                  }}
                />
              );
            })}
          </div>
          <span className="qd-num text-[13px] font-semibold text-hint">
            {current}/{total}
          </span>
        </div>
        {opp && (
          <div className="relative flex min-w-0 flex-1 items-center justify-end gap-2.5">
            {oppGain && (
              <span key={oppGain} aria-hidden="true" className={`${GAIN} right-[58px]`} style={{ color: 'var(--qd-opp-text)', textShadow: '0 0 14px var(--qd-opp-glow)' }}>
                {oppGain}
              </span>
            )}
            <div className="flex min-w-0 flex-col items-end">
              <span className="max-w-full truncate text-[13px] font-medium text-hint">{oppName}</span>
              <span className={SCORE} style={{ color: 'var(--qd-opp-text)', textShadow: '0 0 16px var(--qd-opp-glow)' }}>
                {opp.score}
              </span>
            </div>
            <Avatar id={opp.id} name={opp.name} photoUrl={opp.photoUrl} size={46} ring="opp" badge={oppBadge} glow={opp.glow} />
          </div>
        )}
        {!opp && best !== undefined && (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
            <div className="flex min-w-0 flex-col items-end">
              <span className="text-[13px] font-medium whitespace-nowrap text-hint">{t('score.best')}</span>
              <span className={SCORE} style={{ color: 'var(--qd-gold-text)', textShadow: '0 0 16px var(--qd-gold-glow)' }}>
                {best}
              </span>
            </div>
            <Ball size={46} {...BALLS.gold}>
              <Icon glyph="rating" size={22} stroke={2.2} />
            </Ball>
          </div>
        )}
      </div>
      {!hideNote && (
        <div role="status" className="flex h-6 items-center justify-end">
          {note && (
            <span
              key={note}
              className="qd-pop inline-flex h-6 items-center gap-[5px] rounded-xl px-2.5 text-[12px] font-semibold whitespace-nowrap"
              style={{
                color: off ? 'var(--qd-gold-text)' : 'var(--qd-opp-text)',
                background: off ? 'var(--qd-gold-glass)' : 'var(--qd-opp-tint)',
                boxShadow: off
                  ? 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 0 0 1px var(--qd-gold-ring)'
                  : 'inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px var(--qd-opp-ring)',
              }}
            >
              {note}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
