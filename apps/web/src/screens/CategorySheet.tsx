import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, PREMIUM_CATEGORIES, isPremiumCategory, type GameCategory } from '@quiz-duel/shared';
import { shop, topicAccess, useWallet } from '../lib/economy';
import { Button } from '../components/Button';
import { CategoryTile } from '../components/CategoryTile';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { gameActions, useGame } from '../lib/game';
import { friendsActions, useFriends } from '../lib/friends';
import { setupActions, useSetup } from '../lib/setup';
import { MODE_LOOK, useRulesText } from '../components/Modes';
import type { CSSProperties } from 'react';

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
  const rules = useSetup((s) => s.rules);
  const wallet = useWallet();
  // Платная тема закрылась (билет потрачен) - снимаем выбор.
  const blocked = selected !== null && isPremiumCategory(selected) && topicAccess(wallet.data, selected) === 'locked';
  const summary = useRulesText();
  const look = MODE_LOOK[rules.variant];
  const close = () => {
    gameActions.closeCategory();
    friendsActions.clearTarget();
  };

  return (
    <Sheet
      open={open}
      label={t('s04.aria')}
      onClose={close}
      footer={
        <Button
          disabled={!selected || creating || blocked}
          icon={<Icon glyph={solo ? 'target' : forFriend ? 'send' : 'duel'} size={22} stroke={2.4} />}
          onClick={() => {
            if (!selected) return;
            if (solo) return void gameActions.startSolo(selected);
            const to = forFriend ? friend.id : undefined;
            friendsActions.clearTarget();
            void gameActions.create(selected, to, rules);
          }}
        >
          {t(solo ? 's04.train' : forFriend ? 's04.friendSend' : 's04.create')}
        </Button>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{forFriend ? t('s04.friendTitle') : t('s04.title')}</h2>
          <p className="m-0 text-[14px] font-medium text-hint">
            {forFriend ? t('s04.friendSub', { name: friend.name }) : solo ? t('s04.trainSub') : summary(rules)}
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
        {(['mix', ...CATEGORIES] as GameCategory[]).map((cat) => (
          <CategoryTile key={cat} cat={cat} selected={cat === selected} onPick={() => setSelected(cat)} />
        ))}
      </div>
      <div className="mx-1 -mb-1 flex flex-col gap-0.5">
        <h3 className="m-0 text-[17px] font-bold tracking-[-0.01em]">{t('s04.premium')}</h3>
        <span className="text-[12px] font-medium text-hint">{t('s04.premiumHint')}</span>
      </div>
      <div className="grid auto-rows-fr grid-cols-2 gap-3">
        {PREMIUM_CATEGORIES.map((cat) => {
          const access = topicAccess(wallet.data, cat);
          return (
            <CategoryTile
              key={cat}
              cat={cat}
              access={access}
              selected={cat === selected}
              onPick={() => (access === 'locked' ? shop.openItem({ kind: 'topic', id: cat }) : setSelected(cat))}
            />
          );
        })}
      </div>
      {!solo && (
        <button
          type="button"
          aria-label={t('s04.setupAria')}
          onClick={setupActions.open}
          className="qd-press flex w-full cursor-pointer items-center gap-3 rounded-[22px] border-0 py-2.5 pr-3 pl-2.5 text-left text-text"
          style={{ background: 'var(--qd-sheen), var(--qd-glass)', boxShadow: 'var(--qd-glass-edge-flat)' }}
        >
          <span aria-hidden="true" className="qd-ball h-9 w-9" style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}>
            <Icon glyph={look.glyph} size={18} stroke={2.4} />
          </span>
          <span className="flex min-w-0 grow flex-col gap-px">
            <span className="text-[14px] font-bold">{t('s04.setup')}</span>
            <span className="truncate text-[12px] font-medium text-hint">
              {summary(rules)} · {rules.variant === 'classic' ? t('s32.rated') : t('s12.unrated')}
            </span>
          </span>
          <span className="text-hint">
            <Icon glyph="chevron" size={18} stroke={2.4} />
          </span>
        </button>
      )}
    </Sheet>
  );
}
