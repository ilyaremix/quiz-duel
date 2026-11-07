import { Icon } from './Icon';

/** Галочка 26 px в области нажатия 44 px: пустая - стеклянный квадрат с кромкой, отмечена - сине-фиолетовый градиент со свечением. */
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
        className="relative box-border flex h-[26px] w-[26px] items-center justify-center rounded-[9px] text-white"
        style={{
          background: 'var(--qd-glass)',
          boxShadow: on
            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 0 14px rgba(155, 92, 255, 0.55)'
            : 'inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1.5px var(--tg-theme-hint-color)',
          transition: 'box-shadow 150ms ease',
        }}
      >
        <span
          className="absolute inset-0 rounded-[9px]"
          style={{ background: 'linear-gradient(135deg, #4F8DFF, #9B5CFF)', opacity: on ? 1 : 0, transition: 'opacity 150ms ease' }}
        />
        {on && (
          <span className="qd-pop relative flex">
            <Icon glyph="check" size={16} stroke={3.5} />
          </span>
        )}
      </span>
    </button>
  );
}
