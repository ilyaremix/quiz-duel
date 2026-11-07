import type { ButtonHTMLAttributes, ReactNode } from 'react';

const SIZES = {
  l: { h: 56, fs: 17 },
  m: { h: 48, fs: 16 },
  s: { h: 44, fs: 15 },
} as const;

const EDGE = 'var(--qd-glass-edge-flat)';

const VARIANTS = {
  /** Главная: белая капсула (в светлой теме - тёмная) с радужной кромкой. */
  primary: { bg: 'var(--qd-cta-bg)', fg: 'var(--qd-cta-fg)', shadow: 'var(--qd-cta-edge)' },
  secondary: { bg: 'var(--qd-glass)', fg: 'var(--tg-theme-text-color)', shadow: EDGE },
  brand: { bg: 'var(--qd-brand-tint)', fg: 'var(--qd-brand-text)', shadow: EDGE },
  ghost: { bg: 'transparent', fg: 'var(--tg-theme-link-color)', shadow: 'none' },
  danger: { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong-text)', shadow: EDGE },
  /** Белая кнопка на цветном блоке. */
  onColor: { bg: '#FFFFFF', fg: '#0B0D24', shadow: '0 8px 22px rgba(0, 0, 0, 0.22)' },
} as const;

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  full?: boolean;
  icon?: ReactNode;
}

/**
 * Кнопка-капсула стиля C. Главная большая «дышит» свечением, по ней раз в 3,6 с проходит блик
 * (в режиме без анимаций - нет). Нажатие - scale(0.97) за 120 мс.
 */
export function Button({ variant = 'primary', size = 'l', full = true, icon, children, disabled, ...rest }: ButtonProps) {
  const s = SIZES[size];
  const v = VARIANTS[variant];
  const primary = variant === 'primary';
  const live = primary && size === 'l' && !disabled;
  // Кнопка по ширине текста не сжимается в строке рядом с текстом (иначе «Изменить» превращалась в «Изм…»):
  // сжимается соседний текст, он переносится.
  const cls = `qd-press qd-btn${primary ? ' qd-btn-iris' : ''}${live ? ' qd-btn-glow' : ''}${full ? '' : ' shrink-0 max-w-full'}`;
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${cls} box-border flex min-w-11 cursor-pointer items-center justify-center border-0 px-[22px] leading-none font-bold tracking-[-0.01em] whitespace-nowrap disabled:cursor-default`}
      style={{
        width: full ? '100%' : 'auto',
        height: s.h,
        borderRadius: s.h / 2,
        fontSize: s.fs,
        background: v.bg,
        color: v.fg,
        boxShadow: disabled ? 'none' : v.shadow,
        opacity: disabled ? 0.4 : 1,
      }}
      {...rest}
    >
      {live && <span className="qd-btn-shine" aria-hidden="true" />}
      <span className="relative z-[2] flex min-w-0 items-center justify-center gap-2">
        {icon}
        <span className="truncate">{children}</span>
      </span>
    </button>
  );
}
