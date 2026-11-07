import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AD_FREE_STARS,
  COIN_PACKS,
  GLOWS,
  PACKS,
  PREMIUM_TOPICS,
  STREAK_REWARDS,
  type MeResponse,
  type TaskView,
  type WalletResponse,
} from '@quiz-duel/shared';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { CoinDot, CoinPackTile, GlowTile, PackRow, PriceChip, TaskRow, TopicTile, type ItemState, type TaskState } from '../components/Shop';
import { formatNumber } from '../i18n';
import { api } from '../lib/api';
import { pw, shop, topicAccess, useShop, useWallet } from '../lib/economy';
import { gameActions } from '../lib/game';
import { serverNow } from '../lib/game';
import { friendsActions } from '../lib/friends';

/** «Обновятся через 14:32» - до полуночи по Москве. */
function useLeft(resetAt: number | undefined) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!resetAt) return '';
  const min = Math.max(0, Math.ceil((resetAt - now) / 60_000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

function StreakCard({ w }: { w: WalletResponse }) {
  const { t, i18n } = useTranslation();
  const busy = useShop((s) => s.busy.daily);
  const { day, claimed, series } = w.daily;
  return (
    <section aria-label={t('s27.streak.title')} className="qd-card qd-in qd-d2 flex flex-col gap-3.5 rounded-[28px] px-3.5 py-4">
      <div className="flex items-center justify-between gap-2.5">
        <h2 className="m-0 text-[19px] font-bold tracking-[-0.02em]">{t('s27.streak.title')}</h2>
        <span className="qd-chip qd-chip-gold qd-num">
          <Icon glyph="flame" size={14} stroke={2.5} />
          {t('s27.streak.series', { n: series, days: pw(t, series, 'day') })}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-[5px]">
        {STREAK_REWARDS.map((n, i) => {
          const d = i + 1;
          const past = d < day || (d === day && claimed);
          const today = d === day && !claimed;
          const gift = d === 7;
          return (
            <div
              key={d}
              role="img"
              aria-label={`${t('s27.streak.day', { n: d })} · +${n}`}
              className={`relative box-border flex h-[78px] flex-col items-center justify-between rounded-[16px] px-0.5 py-[7px] ${today ? 'qd-breathe' : ''}`}
              style={
                {
                  background: today ? 'var(--qd-brand-glass)' : past ? 'var(--qd-gold-glass)' : 'var(--qd-glass)',
                  boxShadow: today ? 'var(--qd-brand-edge)' : past ? 'var(--qd-gold-edge)' : 'var(--qd-glass-edge-flat)',
                  opacity: !past && !today ? 0.62 : 1,
                  '--qd-ga': 'var(--qd-brand-edge)',
                  '--qd-gb': 'inset 0 1px 0 rgba(255,255,255,.45), inset 0 0 0 1.5px rgba(195,166,255,.9), 0 0 30px rgba(155,92,255,.7)',
                } as CSSProperties
              }
            >
              <span className="text-[11px] font-bold" style={{ color: today ? 'var(--qd-brand-text)' : 'var(--tg-theme-hint-color)' }}>
                {d}
              </span>
              <span
                aria-hidden="true"
                className="qd-ball h-6 w-6"
                style={{ '--qd-ball': past ? '#3BE58B' : '#FFD36B', '--qd-ball-glow': past ? 'var(--qd-ok-glow)' : 'var(--qd-gold-glow)', color: past ? '#04261A' : '#3A2600' } as CSSProperties}
              >
                <Icon glyph={past ? 'check' : gift ? 'gift' : 'coin'} size={13} stroke={2.7} />
              </span>
              <span className="qd-num text-[12px] font-extrabold" style={{ color: past ? 'var(--qd-gold-text)' : today ? 'var(--tg-theme-text-color)' : 'var(--tg-theme-hint-color)' }}>
                +{formatNumber(n, i18n.language)}
              </span>
            </div>
          );
        })}
      </div>
      {claimed ? (
        <div role="status" className="qd-chip qd-chip-ok h-auto! min-h-9 justify-center py-1.5 text-center whitespace-normal!">
          <Icon glyph="check" size={15} stroke={3} />
          {t('s27.streak.claimed')}
        </div>
      ) : (
        <Button size="m" icon={<Icon glyph="gift" size={20} stroke={2.4} />} disabled={busy} onClick={() => void shop.claimDaily(t)}>
          {t('s27.streak.claim', { n: w.daily.reward })}
        </Button>
      )}
      <p className="mx-1 my-0 text-[12px] leading-[1.4] font-medium text-hint">{t('s27.streak.hint')}</p>
    </section>
  );
}

function taskState(task: TaskView, checking: boolean): TaskState {
  if (task.claimed) return 'done';
  if (task.type === 'play') return task.ready ? 'claim' : 'go';
  if (task.type === 'channel' && checking) return 'check';
  return 'go';
}

function Tasks({ w, appUrl }: { w: WalletResponse; appUrl: string | undefined }) {
  const { t } = useTranslation();
  const checking = useShop((s) => s.checking);
  const busy = useShop((s) => s.busy);
  const left = useLeft(w.resetAt);
  const act = (task: TaskView, state: TaskState) => {
    if (state === 'claim' || state === 'check') return void shop.claimTask(task, t);
    if (task.type === 'play') return gameActions.setTab('home');
    if (task.type === 'ads') return void shop.watchAd('reward');
    if (task.type === 'channel') return shop.openChannel(task);
    if (task.type === 'story') return void (appUrl && shop.postStory(task, appUrl, t));
    if (task.type === 'invite') return void friendsActions.shareInvite(t);
  };
  const row = (task: TaskView) => {
    const state = taskState(task, Boolean(checking[task.id]));
    return <TaskRow key={task.id} task={task} state={state} busy={Boolean(busy[`task:${task.id}`])} onAction={() => act(task, state)} />;
  };
  const daily = w.tasks.filter((x) => x.freq === 'daily');
  const once = w.tasks.filter((x) => x.freq !== 'daily');
  return (
    <>
      {daily.length > 0 && (
        <section className="qd-in qd-d3 flex flex-col gap-2.5">
          <div className="mx-1 mt-1 flex items-center justify-between gap-2.5">
            <h2 className="m-0 text-[19px] font-bold tracking-[-0.02em]">{t('s27.daily')}</h2>
            <span className="qd-chip qd-num" style={{ color: 'var(--tg-theme-hint-color)' }}>
              <Icon glyph="clock" size={13} stroke={2.5} />
              {t('s27.reset', { t: left })}
            </span>
          </div>
          {daily.map(row)}
        </section>
      )}
      {once.length > 0 && (
        <section className="qd-in qd-d4 flex flex-col gap-2.5">
          <h2 className="mt-1 mb-0 ml-1 text-[19px] font-bold tracking-[-0.02em]">{t('s27.once')}</h2>
          {once.map(row)}
        </section>
      )}
    </>
  );
}

function Items({ w, me }: { w: WalletResponse; me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const glowState = (id: (typeof GLOWS)[number]): ItemState => (w.glow === id ? 'equipped' : w.owned.glow.includes(id) ? 'owned' : 'buy');
  const packState = (id: (typeof PACKS)[number]): ItemState => (w.pack === id ? 'equipped' : w.owned.pack.includes(id) ? 'owned' : 'buy');
  return (
    <>
      <section
        aria-label={t('s27.sec.adFree')}
        className={`qd-in qd-d2 flex items-center gap-3 rounded-[24px] p-3 pl-3.5 ${w.adFree ? 'qd-card-ok' : 'qd-card'}`}
      >
        <span
          aria-hidden="true"
          className="qd-ball h-11 w-11"
          style={{ '--qd-ball': w.adFree ? '#3BE58B' : '#FF6A88', '--qd-ball-glow': w.adFree ? 'var(--qd-ok-glow)' : 'rgba(255,106,136,.5)', color: w.adFree ? '#04261A' : '#FFFFFF' } as CSSProperties}
        >
          <Icon glyph={w.adFree ? 'check' : 'ad'} size={21} stroke={2.3} />
        </span>
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-[15px] font-bold tracking-[-0.01em]">{w.adFree ? t('s27.adFree.on') : t('s27.adFree.t')}</span>
          {!w.adFree && <span className="text-[12px] font-medium text-hint">{t('s27.adFree.d')}</span>}
        </div>
        {!w.adFree && (
          <button
            type="button"
            onClick={() => shop.openItem({ kind: 'adFree', id: 'adfree' })}
            className="qd-press box-border flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-[20px] border-0 pr-3.5 pl-[5px] text-[14px] font-bold"
            style={{ background: 'var(--qd-gold-glass)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4), inset 0 0 0 1px var(--qd-gold-ring)', color: 'var(--qd-gold-text)' }}
          >
            <CoinDot size={30} star />
            {formatNumber(AD_FREE_STARS, i18n.language)}
          </button>
        )}
      </section>

      <section className="qd-in qd-d3 flex flex-col gap-2.5">
        <div className="mx-1 mt-1 flex flex-col gap-0.5">
          <h2 className="m-0 text-[19px] font-bold tracking-[-0.02em]">{t('s27.sec.glow')}</h2>
          <span className="text-[12px] leading-[1.4] font-medium text-hint">{t('s27.glowNote')}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          {GLOWS.map((id) => (
            <GlowTile key={id} id={id} state={glowState(id)} meId={me.id} meName={me.firstName} mePhoto={me.photoUrl} onPress={() => shop.openItem({ kind: 'glow', id })} />
          ))}
        </div>
      </section>

      <section className="qd-in qd-d4 flex flex-col gap-2.5">
        <div className="mx-1 mt-1 flex flex-col gap-0.5">
          <h2 className="m-0 text-[19px] font-bold tracking-[-0.02em]">{t('s27.sec.packs')}</h2>
          <span className="text-[12px] leading-[1.4] font-medium text-hint">{t('s27.packNote')}</span>
        </div>
        {PACKS.map((id) => (
          <PackRow key={id} id={id} state={packState(id)} onPress={() => shop.openItem({ kind: 'pack', id })} />
        ))}
      </section>

      <section className="qd-in qd-d5 flex flex-col gap-2.5">
        <h2 className="mt-1 mb-0 ml-1 text-[19px] font-bold tracking-[-0.02em]">{t('s27.sec.topics')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {PREMIUM_TOPICS.map((id) => {
            const access = topicAccess(w, id);
            return <TopicTile key={id} id={id} state={access === 'locked' ? 'buy' : access} onPress={() => shop.openItem({ kind: 'topic', id })} />;
          })}
        </div>
      </section>

      <section className="qd-in qd-d6 flex flex-col gap-2.5">
        <h2 className="mt-1 mb-0 ml-1 text-[19px] font-bold tracking-[-0.02em]">{t('s27.sec.coins')}</h2>
        <div className="grid grid-cols-3 gap-2 pt-2.5">
          {COIN_PACKS.map((p) => (
            <CoinPackTile key={p.id} id={p.id} onPress={() => shop.openItem({ kind: 'coins', id: p.id })} />
          ))}
        </div>
      </section>
    </>
  );
}

/** Экран 27: магазин. Задания (серия входа, на сегодня, разовые) и товары (без рекламы, свечение, реакции, темы, монеты). */
export function ShopScreen({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const wallet = useWallet();
  const config = useQuery({ queryKey: ['config'], queryFn: api.config });
  const section = useShop((s) => s.section);
  const w = wallet.data;
  const [earn, items] = t('s27.tabs').split('|');
  const coins = w?.coins ?? 0;

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen flex flex-col gap-3.5 pb-[120px]!">
        <header className="qd-in flex items-center gap-3">
          <h1 className="m-0 grow text-[28px] font-bold tracking-[-0.02em]">{t('s27.title')}</h1>
          <div
            role="status"
            aria-label={`${t('s27.balance')}: ${formatNumber(coins, i18n.language)} ${pw(t, coins, 'coin')}`}
            className="qd-card-gold box-border flex h-11 items-center gap-2 rounded-[22px] pr-3.5 pl-1.5"
          >
            <span aria-hidden="true" className="qd-ball qd-bob h-8 w-8" style={{ '--qd-ball': '#FFD36B', '--qd-ball-glow': 'var(--qd-gold-glow)', color: '#3A2600' } as CSSProperties}>
              <Icon glyph="coin" size={17} stroke={2.4} />
            </span>
            <span className="qd-num text-[19px] font-extrabold" style={{ color: 'var(--qd-gold-text)' }}>
              {w ? formatNumber(coins, i18n.language) : '…'}
            </span>
          </div>
        </header>

        <div className="qd-in qd-d1">
          <Segmented
            label={t('s27.tabsAria')}
            options={[
              { value: 'earn', label: earn ?? '' },
              { value: 'items', label: items ?? '' },
            ]}
            value={section}
            onPick={shop.setSection}
          />
        </div>

        {!w &&
          (wallet.isError ? (
            <div className="qd-card flex items-center gap-3 rounded-[26px] p-4">
              <span className="min-w-0 grow text-[14px] leading-[1.35] font-medium text-hint">{t('toast.loadFailed')}</span>
              <Button variant="secondary" size="s" full={false} onClick={() => void wallet.refetch()} disabled={wallet.isFetching}>
                {t('common.retry')}
              </Button>
            </div>
          ) : (
            [0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="qd-skel qd-glass h-[84px] rounded-[24px]" />)
          ))}

        {w && section === 'earn' && (
          <>
            <StreakCard w={w} />
            <Tasks w={w} appUrl={config.data?.appUrl} />
          </>
        )}
        {w && section === 'items' && <Items w={w} me={me} />}
      </main>
    </div>
  );
}

export { PriceChip };
