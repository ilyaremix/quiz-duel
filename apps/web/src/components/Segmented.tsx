import type { CSSProperties } from 'react';

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
  disabled?: boolean;
}

/** Сегменты «Авто | Русский | English»: радиогруппа из 2-4 кнопок, выбранная - объёмная. */
export function Segmented<T extends string>({ label, options, value, onPick, disabled }: SegmentedProps<T>) {
  const small = options.length > 3;
  return (
    <div role="radiogroup" aria-label={label} className="box-border flex w-full gap-1 rounded-2xl bg-page p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onPick(o.value)}
            className="qd-press h-11 min-w-0 flex-1 basis-0 cursor-pointer truncate rounded-xl border-0 font-[inherit] font-extrabold disabled:cursor-default disabled:opacity-60"
            style={
              {
                padding: `0 ${small ? 4 : 8}px`,
                fontSize: small ? 13 : 15,
                background: on ? 'var(--qd-surface-2)' : 'transparent',
                color: on ? 'var(--tg-theme-text-color)' : 'var(--tg-theme-hint-color)',
                '--qd-shadow': on ? '0 3px 0 var(--qd-lip)' : 'none',
              } as CSSProperties
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
