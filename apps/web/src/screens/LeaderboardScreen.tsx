import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LeaderRowView, MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LeaderRow, LeaderRowSkeleton } from '../components/LeaderRow';
import { Notice } from '../components/Notice';
import { TabDock } from '../components/TabDock';
import { formatNumber } from '../i18n';
import { api, queryKeys } from '../lib/api';

const MEDAL = ['var(--qd-gold)', 'var(--qd-silver)', 'var(--qd-bronze)'];
/** Пьедестал: 2-е место слева, 1-е по центру, 3-е справа. */
const ORDER = [1, 0, 2];
const HEIGHT = [92, 68, 52];

function Podium({ top, meId }: { top: LeaderRowView[]; meId: number }) {
  const { i18n } = useTranslation();
  return (
    <div className="grid grid-cols-3 items-end gap-2.5">
      {ORDER.map((i) => {
        const row = top[i];
        if (!row) return <div key={i} />;
        const me = row.player.id === meId;
        return (
          <div key={i} className="flex min-w-0 flex-col items-center gap-1">
            <Avatar id={row.player.id} name={row.player.name} photoUrl={row.player.photoUrl} size={i === 0 ? 64 : 52} ring={me ? 'me' : 'none'} />
            <span className="mt-1 max-w-full truncate text-[14px] font-extrabold">{row.player.name}</span>
            <span className="qd-num flex items-center gap-[3px] text-[13px] font-extrabold text-gold-text">
              <Icon glyph="rating" size={12} stroke={2.5} />
              {formatNumber(row.player.rating, i18n.language)}
            </span>
            <div
              className="mt-1.5 box-border flex w-full justify-center rounded-t-[18px] rounded-b-lg bg-section pt-2.5 text-[28px] font-black shadow-[0_4px_0_var(--qd-lip)]"
              style={{ height: HEIGHT[i], color: MEDAL[i] }}
            >
              {row.place}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PodiumSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-3 items-end gap-2.5">
      {ORDER.map((i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <span className="qd-skel rounded-full bg-surface-2" style={{ width: i === 0 ? 64 : 52, height: i === 0 ? 64 : 52 }} />
          <span className="qd-skel h-3 w-[70%] rounded-md bg-surface-2" />
          <span className="qd-skel w-full rounded-t-[18px] rounded-b-lg bg-section" style={{ height: HEIGHT[i] }} />
        </div>
      ))}
    </div>
  );
}

/** Экран 15: топ-100 пьедесталом и списком, моя строка закреплена снизу, если меня не видно в списке. */
export function LeaderboardScreen({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const board = useQuery({ queryKey: queryKeys.leaderboard, queryFn: api.leaderboard });
  const data = board.data;
  const meBrief = { id: me.id, name: me.firstName, username: me.username, photoUrl: me.photoUrl, rating: data?.me.rating ?? me.rating };
  const inTop = Boolean(data?.top.some((r) => r.player.id === me.id));
  const pinned = !inTop && (board.isPending || Boolean(data));

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen qd-screen-in flex flex-col gap-4" style={{ paddingBottom: pinned ? 200 : 120 }}>
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-black">{t('s15.title')}</h1>
          <p className="m-0 text-[14px] font-semibold text-hint">{t('s15.sub')}</p>
        </header>

        {board.isPending ? (
          <section aria-label={t('s15.loading')} aria-busy="true" className="flex flex-col gap-4">
            <PodiumSkeleton />
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <LeaderRowSkeleton key={i} />
              ))}
            </div>
          </section>
        ) : board.isError ? (
          <div className="flex flex-col gap-3 pt-6">
            <Notice glyph="alert" title={t('s15.error')} text={t('toast.loadFailed')} />
            <Button variant="secondary" onClick={() => void board.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !data ? null : data.top.length === 0 ? (
          <div className="pt-6">
            <Notice glyph="rating" tone="gold" title={t('s15.title')} text={t('s15.empty')} />
          </div>
        ) : (
          <>
            <section aria-label={t('s15.podium')} className="qd-fade-in">
              <Podium top={data.top} meId={me.id} />
            </section>
            <section aria-label={t('s15.list')} className="flex flex-col gap-2">
              {data.top.slice(3).map((row) => (
                <LeaderRow key={row.player.id} place={row.place} player={row.player} games={row.games} me={row.player.id === me.id} />
              ))}
            </section>
          </>
        )}
      </main>

      {pinned && (
        <div className="fixed right-4 left-4 z-10" style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 102px)' }}>
          <div className="mx-auto flex max-w-[560px] flex-col gap-1.5">
            {data && data.me.place === null && (
              <span className="qd-num self-center rounded-xl bg-section px-2.5 py-1 text-[12px] font-bold text-hint">
                {t('s15.qualify', { count: data.me.gamesToQualify })}
              </span>
            )}
            {data ? <LeaderRow place={data.me.place} player={meBrief} games={data.me.games} me pinned /> : <LeaderRowSkeleton pinned />}
          </div>
        </div>
      )}

      <TabDock active="rating" />
    </div>
  );
}
