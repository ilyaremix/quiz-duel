import { useTranslation } from 'react-i18next';
import { Avatar, type AvatarBadge } from './Avatar';

export interface ScoreSide {
  id: number;
  name: string;
  photoUrl: string | null;
  /** Уже отформатированный счёт («2 340»). */
  score: string;
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
}

/** Счёт партии сверху: я слева (синий), соперник справа (оранжевый), точки прогресса и «3/10». */
export function ScoreBar({ me, opp, current, total, oppState, meState }: ScoreBarProps) {
  const { t } = useTranslation();
  const oppBadge: AvatarBadge = oppState === 'answered' ? 'answered' : oppState === 'offline' ? 'offline' : 'none';
  const note =
    oppState === 'answered' ? t('score.answered') : oppState === 'offline' ? t('score.offline') : '';

  return (
    <section aria-label={t('score.aria')} className="flex w-full flex-col gap-0.5">
      <div className="flex min-h-[58px] items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar id={me.id} name={me.name} photoUrl={me.photoUrl} size={44} ring="me" badge={meState === 'answered' ? 'answered' : 'none'} />
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-hint">{t('common.you')}</span>
            <span className="qd-num text-[20px] font-extrabold text-me-text">{me.score}</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div aria-hidden="true" className="flex items-center gap-1">
            {Array.from({ length: total }, (_, i) => {
              const n = i + 1;
              return (
                <span
                  key={n}
                  className="qd-dot h-1.5 rounded-[3px]"
                  style={{
                    width: n === current ? 16 : 6,
                    background: n < current ? 'var(--qd-brand)' : n === current ? 'var(--qd-brand-text)' : 'var(--qd-surface-2)',
                  }}
                />
              );
            })}
          </div>
          <span className="qd-num text-[13px] font-extrabold text-hint">
            {current}/{total}
          </span>
        </div>
        {opp && (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <div className="flex min-w-0 flex-col items-end">
              <span className="max-w-full truncate text-[13px] font-bold text-hint">{opp.name || t('score.opp')}</span>
              <span className="qd-num text-[20px] font-extrabold text-opp-text">{opp.score}</span>
            </div>
            <Avatar id={opp.id} name={opp.name} photoUrl={opp.photoUrl} size={44} ring="opp" badge={oppBadge} />
          </div>
        )}
      </div>
      <div role="status" className="flex h-[18px] justify-end text-[13px] font-bold" style={{ color: oppState === 'offline' ? 'var(--qd-gold-text)' : 'var(--qd-opp-text)' }}>
        {note && (
          <span key={note} className="qd-rise">
            {note}
          </span>
        )}
      </div>
    </section>
  );
}
