import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, COUNT_OPTIONS, PREMIUM_CATEGORIES, TIME_OPTIONS, VARIANTS, isPremiumCategory, type GameCategory } from '@quiz-duel/shared';
import { shop, topicAccess, useWallet } from '../lib/economy';
import { Button } from '../components/Button';
import { CategoryTile } from '../components/CategoryTile';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { gameActions, useGame } from '../lib/game';
import { friendsActions, useFriends } from '../lib/friends';
import { setupActions, useSetup } from '../lib/setup';
import { isDefaultRules, MODE_LOOK, ModeCard } from '../components/Modes';

const H3 = 'm-0 ml-1 text-[11px] font-semibold tracking-[0.08em] text-hint uppercase';

/**
 * Режим и настройки дуэли - вверху шторки, чтобы их было видно сразу. Свёрнуто - одна строка
 * с текущими правилами, раскрыто - режимы, время на ответ и число вопросов прямо в шторке
 * (раньше это была вторая шторка поверх первой).
 */
function RulesPanel() {
  const { t } = useTranslation();
  const rules = useSetup((s) => s.rules);
  const open = useSetup((s) => s.expanded);
  const look = MODE_LOOK[rules.variant];
  const timeLabels = t('s32.timeOpts').split('|');
  const rated = rules.variant === 'classic';
  return (
    <section
      aria-label={t('s04.setup')}
      className="flex flex-col rounded-[24px]"
      style={{ background: open ? 'var(--qd-glass)' : 'var(--qd-sheen), var(--qd-glass)', boxShadow: 'var(--qd-glass-edge-flat)' }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('s04.setupAria')}
        onClick={setupActions.toggle}
        className="qd-press flex w-full cursor-pointer flex-col gap-2 rounded-[24px] border-0 bg-transparent px-3 pt-2.5 text-left text-text"
        style={{ paddingBottom: open ? 6 : 12 }}
      >
        <span className="flex w-full items-center gap-2">
          <span className="grow text-[14px] font-bold">{t('s04.setup')}</span>
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold" style={{ color: open ? 'var(--tg-theme-hint-color)' : 'var(--qd-brand-text)' }}>
            {open ? t('s04.setupHide') : t('s04.setupEdit')}
            <span aria-hidden="true" className="flex" style={{ transform: `rotate(${open ? -90 : 90}deg)`, transition: 'transform 240ms var(--qd-ease-ui)' }}>
              <Icon glyph="chevron" size={14} stroke={2.8} />
            </span>
          </span>
        </span>
        {!open && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="qd-chip gap-1.5! pr-2.5! pl-1! text-[13px]!">
              <span aria-hidden="true" className="qd-ball h-[22px] w-[22px]" style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}>
                <Icon glyph={look.glyph} size={12} stroke={2.6} />
              </span>
              {t(`s32.mode.${rules.variant}.t`)}
            </span>
            <span className="qd-chip qd-num gap-1! pr-2.5! pl-2! text-[13px]!">
              <Icon glyph="question" size={13} stroke={2.5} />
              {rules.count} {t('plural.question', { count: rules.count })}
            </span>
            <span className="qd-chip qd-num gap-1! pr-2.5! pl-2! text-[13px]!">
              <Icon glyph="clock" size={13} stroke={2.5} />
              {t('s04.perAnswer', { t: rules.timeSec })}
            </span>
            <span className="ml-0.5 text-[12px] font-semibold" style={{ color: rated ? 'var(--qd-correct-text)' : 'var(--tg-theme-hint-color)' }}>
              {rated ? t('s04.rated') : t('s04.unrated')}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div className="qd-fade-in flex flex-col gap-2.5 px-2.5 pt-0.5 pb-3">
          <div role="radiogroup" aria-label={t('s32.modes')} className="grid auto-rows-fr grid-cols-2 gap-2">
            {VARIANTS.map((v) => (
              <ModeCard key={v} variant={v} selected={rules.variant === v} onPick={() => setupActions.set({ variant: v })} />
            ))}
          </div>
          <h3 className={H3}>{t('s32.time')}</h3>
          <Segmented
            label={t('s32.time')}
            options={TIME_OPTIONS.map((n, i) => ({ value: String(n), label: timeLabels[i] ?? `${n}` }))}
            value={String(rules.timeSec)}
            onPick={(v) => setupActions.set({ timeSec: Number(v) })}
          />
          <h3 className={H3}>{t('s32.count')}</h3>
          <Segmented
            label={t('s32.count')}
            options={COUNT_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(rules.count)}
            onPick={(v) => setupActions.set({ count: Number(v) })}
          />
          <div className="flex min-h-8 items-center gap-2 pl-1">
            <span role="status" className="min-w-0 grow text-[12px] leading-[1.35] font-medium" style={{ color: rated ? 'var(--qd-correct-text)' : 'var(--tg-theme-hint-color)' }}>
              {rated ? t('s32.rated') : t('s32.unrated')}
            </span>
            {!isDefaultRules(rules) && (
              <button type="button" onClick={setupActions.reset} className="qd-press qd-link shrink-0 cursor-pointer border-0 bg-transparent p-1 text-[13px] font-semibold">
                {t('s32.reset')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Экран 4: нижняя шторка выбора темы перед дуэлью или тренировкой. Настройки дуэли - вверху. */
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
  const close = () => {
    gameActions.closeCategory();
    friendsActions.clearTarget();
  };
  const base = CATEGORIES as readonly GameCategory[];

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
      <div className="-mb-1 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{forFriend ? t('s04.friendTitle') : t('s04.title')}</h2>
          {(forFriend || solo) && (
            <p className="m-0 text-[14px] font-medium text-hint">{forFriend ? t('s04.friendSub', { name: friend.name }) : t('s04.trainSub')}</p>
          )}
        </div>
        <button type="button" aria-label={t('common.close')} onClick={close} className="qd-press qd-icon-btn" style={{ width: 44, height: 44 }}>
          <Icon glyph="close" size={18} stroke={2.5} />
        </button>
      </div>

      {!solo && <RulesPanel />}

      <div className="flex flex-col gap-2.5">
        <CategoryTile cat="mix" wide selected={selected === 'mix'} onPick={() => setSelected('mix')} sub={t(solo ? 'cat.mix.solo' : 'cat.mix.duel')} />
        <div className="grid grid-cols-2 gap-2.5">
          {base.map((cat, i) => (
            <div key={cat} className={i === base.length - 1 && base.length % 2 === 1 ? 'col-span-2' : ''}>
              <CategoryTile cat={cat} selected={cat === selected} onPick={() => setSelected(cat)} />
            </div>
          ))}
        </div>
      </div>

      <div className="mx-1 -mb-1.5 flex flex-col gap-0.5">
        <h3 className="m-0 text-[17px] font-bold tracking-[-0.01em]">{t('s04.premium')}</h3>
        <span className="text-[12px] font-medium text-hint">{t('s04.premiumHint')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {PREMIUM_CATEGORIES.map((cat) => {
          const access = topicAccess(wallet.data, cat);
          return (
            <CategoryTile
              key={cat}
              cat={cat}
              access={access}
              sub={access === 'pass' ? t('s04.pass') : access === 'owned' ? t('s04.owned') : t(`cat.${cat}.count`)}
              selected={cat === selected}
              onPick={() => (access === 'locked' ? shop.openItem({ kind: 'topic', id: cat }) : setSelected(cat))}
            />
          );
        })}
      </div>
    </Sheet>
  );
}
