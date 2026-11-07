import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { REFERRAL, type LeaderRowView, type MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Ball, BALLS } from '../components/Ball';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LeaderRow, LeaderRowSkeleton } from '../components/LeaderRow';
import { Notice } from '../components/Notice';
import { formatNumber } from '../i18n';
import { api, queryKeys } from '../lib/api';
import { pw, useWallet } from '../lib/economy';
import { friendsActions } from '../lib/friends';

/** Пьедестал стиля C: золотой глянцевый столб с бликом, серебряное и бронзовое стекло; у первого места - золотой ореол. */
const PILLAR = [
  {
    cls: 'qd-glint',
    bg: 'radial-gradient(90% 50% at 30% 0%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 70%), linear-gradient(180deg, #FFE08A, #F2B230)',
    edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 0 34px var(--qd-gold-glow)',
    ink: '#3A2600',
    halo: '0 0 0 3px rgba(255, 211, 107, 0.5), 0 0 26px var(--qd-gold-glow)',
  },
  {
    cls: '',
    bg: 'linear-gradient(180deg, rgba(213, 218, 240, 0.34), rgba(213, 218, 240, 0.08)), var(--qd-glass)',
    edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 0 0 1px rgba(213, 218, 240, 0.35), 0 12px 30px rgba(3, 4, 20, 0.3)',
    ink: 'var(--qd-silver)',
    halo: 'none',
  },
  {
    cls: '',
    bg: 'linear-gradient(180deg, rgba(232, 165, 106, 0.34), rgba(232, 165, 106, 0.08)), var(--qd-glass)',
    edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 0 0 1px rgba(232, 165, 106, 0.35), 0 12px 30px rgba(3, 4, 20, 0.3)',
    ink: 'var(--qd-bronze)',
    halo: 'none',
  },
] as const;
/** Пьедестал: 2-е место слева, 1-е по центру, 3-е справа. */
const ORDER = [1, 0, 2];
const HEIGHT = [92, 68, 52];

/** Свободное место на пьедестале: пунктирный кружок, «Свободно», приглушённый столб с номером. */
function EmptyStep({ i }: { i: number }) {
  const { t } = useTranslation();
  const size = i === 0 ? 64 : 52;
  const k = PILLAR[i]!;
  return (
    <div role="img" aria-label={t('s15.freeAria', { n: i + 1 })} className="flex min-w-0 flex-col items-center gap-1">
      <span
        aria-hidden="true"
        className="box-border flex items-center justify-center rounded-full text-hint"
        style={{ width: size, height: size, border: '2px dashed var(--qd-dash)', background: 'var(--qd-glass)' }}
      >
        <Icon glyph="userPlus" size={Math.round(size * 0.38)} stroke={2.2} />
      </span>
      <span className="mt-1 max-w-full truncate text-[14px] font-semibold text-hint">{t('s15.free')}</span>
      <span aria-hidden="true" className="qd-num text-[13px] font-bold text-hint opacity-60">
        —
      </span>
      <div
        aria-hidden="true"
        className="mt-1.5 box-border flex w-full justify-center rounded-[20px_20px_10px_10px] pt-2.5 text-[28px] font-bold"
        style={{ height: HEIGHT[i], background: k.bg, boxShadow: k.edge.replace(/, 0 0 34px var\(--qd-gold-glow\)/, ''), color: k.ink, opacity: 0.38 }}
      >
        {i + 1}
      </div>
    </div>
  );
}

function Podium({ top, meId }: { top: LeaderRowView[]; meId: number }) {
  const { i18n } = useTranslation();
  return (
    <div className="grid grid-cols-3 items-end gap-2.5">
      {ORDER.map((i) => {
        const row = top[i];
        if (!row) return <EmptyStep key={i} i={i} />;
        const me = row.player.id === meId;
        const k = PILLAR[i]!;
        return (
          <div key={i} className="flex min-w-0 flex-col items-center gap-1">
            <div className="rounded-full" style={{ boxShadow: k.halo }}>
              <Avatar
                id={row.player.id}
                name={row.player.name}
                photoUrl={row.player.photoUrl}
                size={i === 0 ? 64 : 52}
                ring={me ? 'me' : 'none'}
                on="none"
                glow={row.player.glow}
              />
            </div>
            <span className="mt-1 max-w-full truncate text-[14px] font-semibold">{row.player.name}</span>
            <span className="qd-num flex items-center gap-[3px] text-[13px] font-bold text-gold-text">
              <Icon glyph="rating" size={12} stroke={2.5} />
              {formatNumber(row.player.rating, i18n.language)}
            </span>
            <div
              className={`${k.cls} mt-1.5 box-border flex w-full justify-center rounded-[20px_20px_10px_10px] pt-2.5 text-[28px] font-bold`}
              style={{ height: HEIGHT[i], background: k.bg, boxShadow: k.edge, color: k.ink }}
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
          <span className="qd-skel rounded-full bg-track" style={{ width: i === 0 ? 64 : 52, height: i === 0 ? 64 : 52 }} />
          <span className="qd-skel h-3 w-[70%] rounded-md bg-track" />
          <span className="qd-skel qd-glass w-full rounded-[20px_20px_10px_10px]" style={{ height: HEIGHT[i] }} />
        </div>
      ))}
    </div>
  );
}

/** Пустая строка списка: «Место свободно» - видно, что в топ ещё можно попасть. */
function EmptyRow({ place }: { place: number }) {
  const { t, i18n } = useTranslation();
  return (
    <div
      role="img"
      aria-label={t('s15.freeAria', { n: place })}
      className="box-border flex h-[60px] w-full items-center gap-3 rounded-[24px] pr-3.5 pl-3"
      style={{ border: '1.5px dashed var(--qd-dash)', background: 'var(--qd-glass)', opacity: 0.75 }}
    >
      <span className="qd-num w-7 shrink-0 text-center text-[15px] font-bold text-hint">{formatNumber(place, i18n.language)}</span>
      <span
        aria-hidden="true"
        className="box-border flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-hint"
        style={{ border: '1.5px dashed var(--qd-dash)' }}
      >
        <Icon glyph="userPlus" size={16} stroke={2.2} />
      </span>
      <span className="min-w-0 grow truncate text-[15px] font-semibold text-hint">{t('s15.freeRow')}</span>
    </div>
  );
}

/** Мест в топе пока много: позвать друзей (за приглашённого - монеты). */
function InviteCard() {
  const { t } = useTranslation();
  return (
    <div className="qd-card flex items-center gap-3 rounded-[26px] py-3 pr-3 pl-3.5">
      <Ball size={42} {...BALLS.ok}>
        <Icon glyph="userPlus" size={20} stroke={2.3} />
      </Ball>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-[15px] font-bold">{t('s15.inviteT')}</span>
        <span className="text-[12px] leading-[1.35] font-medium text-hint">
          {t('s15.inviteD', { n: REFERRAL.inviter, coins: pw(t, REFERRAL.inviter, 'coin') })}
        </span>
      </div>
      <div className="shrink-0">
        <Button variant="secondary" size="s" full={false} onClick={() => void friendsActions.shareInvite(t)}>
          {t('s15.inviteA')}
        </Button>
      </div>
    </div>
  );
}

/** Сколько пустых строк показать под пьедесталом, чтобы список не обрывался на 1-2 игроках. */
const MIN_ROWS = 5;

/** Экран 15: топ-100 пьедесталом и списком, моя строка закреплена снизу, если меня не видно в списке. */
export function LeaderboardScreen({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const board = useQuery({ queryKey: queryKeys.leaderboard, queryFn: api.leaderboard });
  const wallet = useWallet();
  const data = board.data;
  const meBrief = {
    id: me.id,
    name: me.firstName,
    username: me.username,
    photoUrl: me.photoUrl,
    rating: data?.me.rating ?? me.rating,
    glow: wallet.data?.glow ?? ('none' as const),
  };
  const inTop = Boolean(data?.top.some((r) => r.player.id === me.id));
  const pinned = !inTop && (board.isPending || Boolean(data));

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen flex flex-col gap-4" style={{ paddingBottom: pinned ? 200 : 120 }}>
        <header className="qd-in flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{t('s15.title')}</h1>
          <p className="m-0 text-[14px] font-medium text-hint">{t('s15.sub')}</p>
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
            <Notice glyph="alert" tone="wrong" title={t('s15.error')} text={t('toast.loadFailed')} />
            <Button variant="secondary" onClick={() => void board.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !data ? null : (
          <>
            <section aria-label={t('s15.podium')} className="qd-fade-in mt-2">
              <Podium top={data.top} meId={me.id} />
            </section>
            {data.top.length === 0 && <p className="m-0 -mt-1 px-4 text-center text-[14px] leading-[1.4] font-medium text-hint">{t('s15.empty')}</p>}
            <section aria-label={t('s15.list')} className="flex flex-col gap-2">
              {data.top.slice(3).map((row) => (
                <LeaderRow key={row.player.id} place={row.place} player={row.player} games={row.games} me={row.player.id === me.id} />
              ))}
              {Array.from({ length: Math.max(0, MIN_ROWS - Math.max(3, data.top.length)) }, (_, k) => (
                <EmptyRow key={`free-${k}`} place={Math.max(3, data.top.length) + k + 1} />
              ))}
            </section>
            {data.top.length < 10 && <InviteCard />}
          </>
        )}
      </main>

      {pinned && (
        <div
          aria-hidden="true"
          className="qd-veil z-[9]"
          style={{ height: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 240px)', '--qd-veil-at': '35%' } as CSSProperties}
        />
      )}
      {pinned && (
        <div className="fixed right-4 left-4 z-10" style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 96px)' }}>
          <div className="mx-auto flex max-w-[560px] flex-col gap-1.5">
            {data && data.me.place === null && (
              <span className="qd-chip qd-num self-center" style={{ height: 24, fontSize: 12, color: 'var(--tg-theme-hint-color)' }}>
                {t('s15.qualify', { count: data.me.gamesToQualify })}
              </span>
            )}
            {/* Под моей строкой - сплошная подложка: строки списка не просвечивают сквозь стекло. */}
            <div className="rounded-[24px]" style={{ background: 'var(--qd-bg)' }}>
              {data ? <LeaderRow place={data.me.place} player={meBrief} games={data.me.games} me pinned /> : <LeaderRowSkeleton pinned />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
