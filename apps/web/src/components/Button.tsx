import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

const SIZES = {
  l: { h: 56, fs: 17, r: 18, lip: 4 },
  m: { h: 48, fs: 16, r: 16, lip: 4 },
  s: { h: 44, fs: 15, r: 14, lip: 3 },
} as const;

const VARIANTS = {
  primary: { bg: 'var(--tg-theme-button-color)', fg: 'var(--tg-theme-button-text-color)', lip: 'var(--qd-button-lip)' },
  secondary: { bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-text-color)', lip: 'var(--qd-lip)' },
  brand: { bg: 'var(--qd-brand-tint)', fg: 'var(--qd-brand-text)', lip: 'var(--qd-lip)' },
  ghost: { bg: 'transparent', fg: 'var(--tg-theme-link-color)', lip: '' },
  danger: { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong-text)', lip: 'var(--qd-lip)' },
  /** Белая кнопка на синем блоке «Дуэль с другом». */
  onColor: { bg: '#FFFFFF', fg: '#1F4DB0', lip: '#1B3F8F' },
} as const;

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  full?: boolean;
  icon?: ReactNode;
}

/** «Объёмная» кнопка с подложкой снизу; при нажатии утапливается и сжимается до 0.97. */
export function Button({ variant = 'primary', size = 'l', full = true, icon, children, disabled, ...rest }: ButtonProps) {
  const s = SIZES[size];
  const v = VARIANTS[variant];
  const style = {
    width: full ? '100%' : 'auto',
    height: s.h,
    borderRadius: s.r,
    fontSize: s.fs,
    background: v.bg,
    color: v.fg,
    '--qd-shadow': v.lip && !disabled ? `0 ${s.lip}px 0 ${v.lip}` : 'none',
    opacity: disabled ? 0.4 : 1,
    '--qd-lip-press': `${s.lip - 1}px`,
    '--qd-lip-color': v.lip || 'transparent',
  } as CSSProperties;

  return (
    <button
      type="button"
      disabled={disabled}
      className="qd-press flex min-w-11 cursor-pointer items-center justify-center gap-2 border-0 px-5 font-extrabold leading-none whitespace-nowrap disabled:cursor-default"
      style={style}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
