import { useTranslation } from 'react-i18next';

interface TimerProps {
  seconds: number;
  total?: number;
  /** Доля оставшегося времени 0-100; без неё - по секундам. */
  pct?: number;
  /** Идёт ли время: плавное убывание и тик на последних секундах. */
  live?: boolean;
}

/** Полоска-таймер и цифра; за 5 с до конца краснеет. */
export function Timer({ seconds, total = 15, pct, live = false }: TimerProps) {
  const { t } = useTranslation();
  const s = Math.max(0, Math.min(total, seconds));
  const urgent = s <= 5;
  const width = pct ?? Math.round((s / total) * 100);
  return (
    <div className="flex w-full items-center gap-2.5">
      <div
        role="progressbar"
        aria-label={t('timer.aria')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={s}
        className="h-3.5 grow overflow-hidden rounded-[7px] bg-surface-2"
      >
        <div
          className="h-3.5 rounded-[7px]"
          style={{
            width: `${width}%`,
            background: urgent ? 'var(--qd-wrong)' : 'var(--qd-brand)',
            transition: live ? 'width 100ms linear, background-color 200ms ease' : 'background-color 200ms ease',
          }}
        />
      </div>
      <span
        // Последние 5 с: цифра «тикает» раз в секунду (непрерывное движение - linear).
        className={`${live && urgent ? 'qd-tick ' : ''}qd-num box-border flex h-9 min-w-12 items-center justify-center rounded-[18px] px-2.5 text-[17px] font-extrabold transition-colors duration-200`}
        style={
          urgent
            ? { background: 'var(--qd-wrong-tint)', color: 'var(--qd-wrong-text)' }
            : { background: 'var(--tg-theme-section-bg-color)', color: 'var(--tg-theme-text-color)' }
        }
      >
        {s}
      </span>
    </div>
  );
}
