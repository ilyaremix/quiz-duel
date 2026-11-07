import { useTranslation } from 'react-i18next';

interface TimerProps {
  seconds: number;
  total?: number;
  /** Доля оставшегося времени 0-100; без неё - по секундам. */
  pct?: number;
  /** Идёт ли время: плавное убывание и тик на последних секундах. */
  live?: boolean;
}

/**
 * Таймер стиля C: тонкая светящаяся полоса с «кометой» на конце и цифра в стеклянной капсуле.
 * За 5 с до конца полоса и цифра краснеют, цифра «тикает».
 */
export function Timer({ seconds, total = 15, pct, live = false }: TimerProps) {
  const { t } = useTranslation();
  const s = Math.max(0, Math.min(total, seconds));
  const urgent = s <= 5;
  const width = Math.max(0, Math.min(100, pct ?? Math.round((s / total) * 100)));
  return (
    <div className="flex w-full items-center gap-3">
      <div
        role="progressbar"
        aria-label={t('timer.aria')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={s}
        className="relative h-2 grow rounded-[4px]"
        style={{ background: 'var(--qd-track)', boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)' }}
      >
        <div
          className="relative h-2 rounded-[4px]"
          style={{
            width: `${width}%`,
            background: urgent ? 'linear-gradient(90deg, var(--qd-wrong), #FF8A3D)' : 'var(--qd-timer)',
            boxShadow: `0 0 14px ${urgent ? 'var(--qd-bad-glow)' : 'rgba(155, 92, 255, 0.55)'}`,
            // Плавное убывание - linear.
            transition: live ? 'width 100ms linear' : 'none',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute -top-[5px] -right-2 h-[18px] w-[18px] rounded-full"
            style={{
              background: 'radial-gradient(circle, #FFFFFF 30%, rgba(255, 255, 255, 0) 72%)',
              boxShadow: `0 0 12px 3px ${urgent ? 'rgba(255, 90, 122, 0.85)' : 'rgba(155, 92, 255, 0.75)'}`,
              opacity: width > 0 ? 1 : 0,
            }}
          />
        </div>
      </div>
      <span
        // Последние 5 с: цифра «тикает» раз в секунду (непрерывное движение - linear).
        className={`${live && urgent ? 'qd-tick ' : ''}qd-num box-border flex h-11 min-w-[54px] items-center justify-center rounded-[22px] px-3 text-[20px] font-semibold`}
        style={{
          background: urgent ? 'var(--qd-wrong-tint)' : 'var(--qd-glass)',
          boxShadow: urgent
            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 0 0 1px var(--qd-wrong), 0 0 18px var(--qd-bad-glow)'
            : 'var(--qd-glass-edge-flat)',
          color: urgent ? 'var(--qd-wrong-text)' : 'var(--tg-theme-text-color)',
          transition: 'color 200ms ease, box-shadow 200ms ease',
        }}
      >
        {s}
      </span>
    </div>
  );
}
