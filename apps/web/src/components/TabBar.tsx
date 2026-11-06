import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

export type Tab = 'home' | 'rating' | 'profile';

const LENS = {
  bg: 'linear-gradient(180deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.06) 60%, rgba(255, 255, 255, 0) 100%), var(--qd-brand-tint)',
  border: '1px solid var(--qd-glass-rim)',
  shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -3px 6px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.22)',
};

/** Нижнее меню «стекло» без blur: непрозрачный фон с бликом, активная вкладка - «линза». */
export function TabBar({ active, onTab }: { active: Tab; onTab: (tab: Tab) => void }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('tabs.aria')}
      className="box-border grid w-full grid-cols-3 gap-1 rounded-[32px] p-1.5"
      style={{
        border: '1px solid var(--qd-glass-rim)',
        background: 'linear-gradient(180deg, var(--qd-glass-hi) 0%, rgba(255, 255, 255, 0) 55%), var(--qd-glass-bg)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 0 -1px 0 rgba(0, 0, 0, 0.18), var(--qd-glass-shadow)',
      }}
    >
      {(['home', 'rating', 'profile'] as const).map((id) => {
        const on = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onTab(id)}
            className="qd-press box-border flex h-[54px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[26px] font-[inherit] text-[11px] font-extrabold"
            style={{
              border: on ? LENS.border : '1px solid transparent',
              background: on ? LENS.bg : 'transparent',
              '--qd-shadow': on ? LENS.shadow : 'none',
              color: on ? 'var(--qd-brand-text)' : 'var(--tg-theme-hint-color)',
            } as CSSProperties}
          >
            <Icon glyph={id} size={22} stroke={2.2} />
            {t(`tabs.${id}`)}
          </button>
        );
      })}
    </nav>
  );
}
