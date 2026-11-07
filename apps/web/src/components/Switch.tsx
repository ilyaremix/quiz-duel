import { haptic } from '../lib/telegram';

interface SwitchProps {
  on: boolean;
  label: string;
  onToggle: () => void;
  disabled?: boolean;
}

/** Тумблер: область нажатия 56×44, дорожка 52×32, кружок едет на 20 px (без анимаций - сразу). */
export function Switch({ on, label, onToggle, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic.tick();
        onToggle();
      }}
      className="qd-press flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className="relative h-8 w-[52px] rounded-2xl transition-colors duration-200 ease-[ease]"
        style={{ background: on ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-secondary-bg-color)' }}
      >
        <span
          className="qd-knob absolute top-[3px] left-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_0_rgba(10,8,16,0.25)]"
          style={{ transform: `translateX(${on ? 20 : 0}px)` }}
        />
      </span>
    </button>
  );
}
