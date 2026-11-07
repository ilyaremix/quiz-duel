import type { CSSProperties } from 'react';
import { gameActions, type Tab } from '../lib/game';
import { TabBar } from './TabBar';

/** Нижнее меню, прижатое к низу экрана с учётом safe area, над вуалью. Во время партии его нет. */
export function TabDock({ active }: { active: Tab }) {
  return (
    <>
      {/* Вуаль плотная уже у верхнего края меню (84 px от низа), выше - плавно гаснет. */}
      <div
        aria-hidden="true"
        className="qd-veil z-[9]"
        style={{ height: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 150px)', '--qd-veil-at': '44%' } as CSSProperties}
      />
      <div className="qd-in qd-d4 fixed right-4 left-4 z-10" style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 16px)' }}>
        <div className="mx-auto max-w-[560px]">
          <TabBar active={active} onTab={gameActions.setTab} />
        </div>
      </div>
    </>
  );
}
