import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

export type Tab = 'home' | 'friends' | 'shop' | 'rating' | 'profile';

/** Обновление 2.0: пять вкладок - добавились Друзья и Магазин. */
const TABS = ['home', 'friends', 'shop', 'rating', 'profile'] as const;
const GLYPH = { home: 'home', friends: 'users', shop: 'bag', rating: 'rating', profile: 'profile' } as const;

/**
 * Нижнее меню - плотное стекло капсулой (без blur). Под активной вкладкой светлая «линза»,
 * она переезжает за 300 мс (без анимаций - сразу).
 */
export function TabBar({ active, onTab }: { active: Tab; onTab: (tab: Tab) => void }) {
  const { t } = useTranslation();
  const i = Math.max(0, TABS.indexOf(active));
  return (
    <nav
      aria-label={t('tabs.aria')}
      className="relative box-border grid h-[68px] w-full grid-cols-5 gap-1 rounded-[34px] p-1.5"
      style={{ background: 'var(--qd-bar)', boxShadow: 'var(--qd-glass-edge)' }}
    >
      <span
        aria-hidden="true"
        className="qd-tab-lens absolute top-1.5 bottom-1.5 left-1.5 rounded-[28px]"
        style={{
          width: 'calc((100% - 28px) / 5)',
          background: 'var(--qd-lens)',
          boxShadow: 'var(--qd-lens-edge)',
          transform: i === 0 ? 'translateX(0px)' : `translateX(calc(${i * 100}% + ${i * 4}px))`,
        }}
      />
      {TABS.map((id) => {
        const on = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onTab(id)}
            className="qd-press relative z-[1] box-border flex h-14 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[28px] border-0 bg-transparent p-0 text-[11px] font-semibold whitespace-nowrap"
            style={{ color: on ? 'var(--qd-lens-fg)' : 'var(--tg-theme-hint-color)', transition: 'color 200ms ease' }}
          >
            <Icon glyph={GLYPH[id]} size={22} stroke={2.2} />
            {t(`tabs.${id}`)}
          </button>
        );
      })}
    </nav>
  );
}
