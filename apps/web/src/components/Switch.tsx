import { haptic } from '../lib/telegram';

interface SwitchProps {
  on: boolean;
  label: string;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Тумблер: область нажатия 56×44, дорожка 52×32. Включён - сине-фиолетовый градиент со свечением,
 * выключен - утопленный трек; глянцевый кружок едет на 20 px (без анимаций - сразу).
 */
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
        className="relative h-8 w-[52px] rounded-2xl"
        style={{
          background: 'var(--qd-track)',
          boxShadow: on
            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 16px rgba(155, 92, 255, 0.5)'
            : 'inset 0 1px 3px rgba(0, 0, 0, 0.2), inset 0 0 0 1px var(--qd-glass-rim)',
          transition: 'box-shadow 200ms ease',
        }}
      >
        <span
          className="absolute inset-0 rounded-2xl"
          style={{ background: 'linear-gradient(90deg, #4F8DFF, #9B5CFF)', opacity: on ? 1 : 0, transition: 'opacity 200ms ease' }}
        />
        <span
          className="qd-knob absolute top-[3px] left-[3px] h-[26px] w-[26px] rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #FFFFFF, #E9ECFA)',
            boxShadow: 'inset 0 -1px 0 rgba(0, 0, 0, 0.06), 0 2px 6px rgba(3, 4, 20, 0.35)',
            transform: `translateX(${on ? 20 : 0}px)`,
          }}
        />
      </span>
    </button>
  );
}
