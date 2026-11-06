import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAME_CATEGORIES, type GameCategory } from '@quiz-duel/shared';
import { Button } from '../components/Button';
import { CategoryTile } from '../components/CategoryTile';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { gameActions, useGame } from '../lib/game';

/** Экран 4: нижняя шторка выбора категории перед дуэлью или тренировкой. */
export function CategorySheet() {
  const { t } = useTranslation();
  const open = useGame((s) => s.categorySheet);
  const solo = useGame((s) => s.categoryMode === 'solo');
  const creating = useGame((s) => Boolean(s.pending['game:create'] || s.pending['solo:start']));
  const [selected, setSelected] = useState<GameCategory | null>(null);

  return (
    <Sheet open={open} label={t('s04.aria')} onClose={gameActions.closeCategory}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[22px] font-black">{t('s04.title')}</h2>
          <p className="m-0 text-[14px] font-semibold text-hint">{t(solo ? 's04.trainSub' : 's04.sub')}</p>
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={gameActions.closeCategory}
          className="qd-press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-2 p-0 text-hint"
        >
          <Icon glyph="close" size={18} stroke={2.5} />
        </button>
      </div>
      <div className="grid auto-rows-fr grid-cols-2 gap-3">
        {GAME_CATEGORIES.map((cat) => (
          <CategoryTile key={cat} cat={cat} selected={cat === selected} onPick={() => setSelected(cat)} />
        ))}
      </div>
      <div className="mt-1">
        <Button
          disabled={!selected || creating}
          onClick={() => selected && void (solo ? gameActions.startSolo(selected) : gameActions.create(selected))}
        >
          {t(solo ? 's04.train' : 's04.create')}
        </Button>
      </div>
    </Sheet>
  );
}
