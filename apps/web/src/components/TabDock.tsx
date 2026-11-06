import { gameActions, type Tab } from '../lib/game';
import { TabBar } from './TabBar';

/** Нижнее меню, прижатое к низу экрана с учётом safe area. Во время партии его нет. */
export function TabDock({ active }: { active: Tab }) {
  return (
    <div className="fixed right-4 left-4 z-10" style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 22px)' }}>
      <div className="mx-auto max-w-[560px]">
        <TabBar active={active} onTab={gameActions.setTab} />
      </div>
    </div>
  );
}
