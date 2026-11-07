import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAME_CATEGORIES, type GameCategory } from '@quiz-duel/shared';
import { Button } from '../components/Button';
import { CategoryTile } from '../components/CategoryTile';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { gameActions, useGame } from '../lib/game';
import { friendsActions, useFriends } from '../lib/friends';

/** Экран 4: нижняя шторка выбора категории перед дуэлью или тренировкой. */
export function CategorySheet() {
  const { t } = useTranslation();
  const open = useGame((s) => s.categorySheet);
  const solo = useGame((s) => s.categoryMode === 'solo');
  const creating = useGame((s) => Boolean(s.pending['game:create'] || s.pending['solo:start']));
  const [selected, setSelected] = useState<GameCategory | null>(null);
  // Вызов другу из вкладки «Друзья»: его имя в шапке, кнопка «Отправить вызов».
  const friend = useFriends((s) => s.target);
  const forFriend = !solo && friend !== null;
  const close = () => {
    gameActions.closeCategory();
    friendsActions.clearTarget();
  };

  return (
    <Sheet open={open} label={t('s04.aria')} onClose={close}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{forFriend ? t('s04.friendTitle') : t('s04.title')}</h2>
          <p className="m-0 text-[14px] font-medium text-hint">
            {forFriend ? t('s04.friendSub', { name: friend.name }) : t(solo ? 's04.trainSub' : 's04.sub')}
          </p>
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={close}
          className="qd-press qd-icon-btn"
          style={{ width: 44, height: 44 }}
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
          icon={<Icon glyph={solo ? 'target' : forFriend ? 'send' : 'duel'} size={22} stroke={2.4} />}
          onClick={() => {
            if (!selected) return;
            if (solo) return void gameActions.startSolo(selected);
            const to = forFriend ? friend.id : undefined;
            friendsActions.clearTarget();
            void gameActions.create(selected, to);
          }}
        >
          {t(solo ? 's04.train' : forFriend ? 's04.friendSend' : 's04.create')}
        </Button>
      </div>
    </Sheet>
  );
}
