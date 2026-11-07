import { haptic } from '../lib/telegram';

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
  disabled?: boolean;
}

/**
 * Сегменты «Авто | Русский | English»: радиогруппа из 2-4 кнопок на утопленном треке,
 * под выбранной - светлая линза, она переезжает за 300 мс.
 */
export function Segmented<T extends string>({ label, options, value, onPick, disabled }: SegmentedProps<T>) {
  const n = Math.max(1, options.length);
  const small = n > 3;
  const active = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative box-border flex w-full gap-1 rounded-[26px] p-1"
      style={{ background: 'var(--qd-track)', boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.18), inset 0 0 0 1px var(--qd-glass-rim)' }}
    >
      <span
        aria-hidden="true"
        className="qd-seg-lens absolute top-1 bottom-1 left-1 rounded-[22px]"
        style={{
          width: `calc((100% - ${8 + (n - 1) * 4}px) / ${n})`,
          background: 'var(--qd-lens)',
          boxShadow: 'var(--qd-lens-edge)',
          transform: active === 0 ? 'translateX(0px)' : `translateX(calc(${active * 100}% + ${active * 4}px))`,
        }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => {
              if (on) return;
              haptic.tick();
              onPick(o.value);
            }}
            className="qd-press relative z-[1] h-11 min-w-0 flex-1 basis-0 cursor-pointer truncate rounded-[22px] border-0 bg-transparent font-semibold disabled:cursor-default disabled:opacity-60"
            style={{
              padding: `0 ${small ? 4 : 8}px`,
              fontSize: small ? 13 : 15,
              color: on ? 'var(--qd-lens-fg)' : 'var(--tg-theme-hint-color)',
              transition: 'color 200ms ease, transform var(--qd-dur-press) var(--qd-ease-ui), opacity 150ms ease',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
