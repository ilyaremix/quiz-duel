import { Icon } from './Icon';

/** Галочка 26 px в области нажатия 44 px. */
export function Checkbox({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="qd-press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
    >
      <span
        aria-hidden="true"
        className="box-border flex h-[26px] w-[26px] items-center justify-center rounded-lg border-2 text-white transition-colors duration-150"
        style={{
          background: on ? 'var(--tg-theme-button-color)' : 'transparent',
          borderColor: on ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)',
        }}
      >
        {on && (
          <span className="qd-pop flex">
            <Icon glyph="check" size={16} stroke={3.5} />
          </span>
        )}
      </span>
    </button>
  );
}
