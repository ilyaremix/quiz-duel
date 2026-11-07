import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { REFERRAL, type FriendView, type MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { formatNumber } from '../i18n';
import { api, queryKeys } from '../lib/api';
import { pw } from '../lib/economy';
import { friendsActions, useFriends } from '../lib/friends';
import { gameActions } from '../lib/game';

/** «5 минут назад», «вчера», «3 нояб.» - по правилам языка. */
export function ago(ms: number | null, lang: string, now = Date.now()): string {
  if (!ms) return '';
  const diff = Math.max(0, now - ms);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (diff < 60_000) return rtf.format(0, 'minute');
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  if (diff < 2 * 86_400_000) return rtf.format(-1, 'day');
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(ms);
}

type RowAction = 'challenge' | 'add' | 'accept' | 'busy' | 'sent' | 'none';
type RowStatus = 'online' | 'ingame' | 'offline' | 'request' | 'recent';

const ST_COLOR: Partial<Record<RowStatus, string>> = {
  online: 'var(--qd-correct-text)',
  ingame: 'var(--qd-gold-text)',
  request: 'var(--qd-brand-text)',
};

function FriendRow({ f, status, action, onAction, onDecline }: { f: FriendView; status: RowStatus; action: RowAction; onAction?: () => void; onDecline?: () => void }) {
  const { t, i18n } = useTranslation();
  const name = f.player.name;
  const when = ago(status === 'recent' || status === 'request' ? f.at : f.lastSeenAt, i18n.language);
  const pill = 'box-border inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[22px] px-3.5 text-[14px] font-bold whitespace-nowrap';
  return (
    <div className="relative box-border flex min-h-[72px] w-full items-center gap-2.5 rounded-[24px] py-2.5 pr-2.5 pl-2 text-text" style={{ background: 'var(--qd-sheen), var(--qd-glass)', boxShadow: 'var(--qd-glass-edge)' }}>
      <button type="button" aria-label={name} onClick={() => gameActions.openOpp(f.player.id)} className="qd-press flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0">
        <Avatar id={f.player.id} name={name} photoUrl={f.player.photoUrl} size={44} glow={f.player.glow} badge={status === 'online' || status === 'ingame' ? 'online' : 'none'} />
      </button>
      <div className="flex min-w-0 grow flex-col gap-[3px]">
        <span className="truncate text-[16px] font-bold tracking-[-0.01em]">{name}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-hint">
          <span className="min-w-0 truncate" style={{ color: ST_COLOR[status] }}>
            {t(`s25.st.${status}`, { when })}
          </span>
          <span className="qd-num inline-flex shrink-0 items-center gap-[3px] font-semibold" style={{ color: 'var(--qd-gold-text)' }}>
            <Icon glyph="rating" size={12} stroke={2.6} />
            {formatNumber(f.player.rating, i18n.language)}
          </span>
        </span>
      </div>
      {action === 'challenge' && (
        <button type="button" onClick={onAction} className={`qd-press ${pill} cursor-pointer border-0 pl-[11px]`} style={{ background: 'var(--qd-brand-glass)', boxShadow: 'var(--qd-brand-edge)', color: 'var(--qd-brand-text)' }}>
          <Icon glyph="duel" size={17} stroke={2.4} />
          {t('s25.act.challenge')}
        </button>
      )}
      {action === 'add' && (
        <button type="button" onClick={onAction} className={`qd-press ${pill} cursor-pointer border-0 pl-[11px]`} style={{ background: 'var(--qd-glass)', boxShadow: 'var(--qd-glass-edge-flat)', color: 'var(--tg-theme-text-color)' }}>
          <Icon glyph="userPlus" size={17} stroke={2.3} />
          {t('s25.act.add')}
        </button>
      )}
      {action === 'accept' && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-label={t('s25.declineAria', { name })} onClick={onDecline} className="qd-press flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 p-0" style={{ background: 'var(--qd-glass)', boxShadow: 'var(--qd-glass-edge-flat)', color: 'var(--tg-theme-hint-color)' }}>
            <Icon glyph="close" size={16} stroke={2.6} />
          </button>
          <button type="button" onClick={onAction} className={`qd-press ${pill} cursor-pointer border-0`} style={{ background: 'var(--qd-cta-bg)', boxShadow: 'var(--qd-cta-edge)', color: 'var(--qd-cta-fg)' }}>
            {t('s25.act.accept')}
          </button>
        </div>
      )}
      {action === 'busy' && (
        <span className={pill} style={{ background: 'var(--qd-gold-glass)', boxShadow: 'inset 0 0 0 1px var(--qd-gold-ring)', color: 'var(--qd-gold-text)' }}>
          <Icon glyph="clock" size={15} stroke={2.4} />
          {t('s25.act.busy')}
        </span>
      )}
      {action === 'sent' && (
        <span role="status" className={`qd-pop ${pill}`} style={{ background: 'var(--qd-correct-tint)', boxShadow: 'inset 0 0 0 1px var(--qd-ok-ring)', color: 'var(--qd-correct-text)' }}>
          <Icon glyph="check" size={15} stroke={3} />
          {t('s25.act.sent')}
        </span>
      )}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-1 mb-0 ml-1 flex items-center gap-2 text-[19px] font-bold tracking-[-0.02em]">{children}</h2>;
}

/** Экран 25: друзья. Приглашение с наградой, входящие заявки, друзья (в сети сверху), недавние соперники. */
export function FriendsScreen({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const list = useQuery({ queryKey: queryKeys.friends, queryFn: api.friends, refetchInterval: 30_000 });
  const sent = useFriends((s) => s.sent);
  const data = list.data;
  const num = (n: number) => formatNumber(n, i18n.language);
  const onlineN = data?.friends.filter((f) => f.status !== 'offline').length ?? 0;

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen flex flex-col gap-3.5 pb-[120px]!">
        <header className="qd-in flex items-center gap-3">
          <div className="flex min-w-0 grow flex-col gap-1">
            <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{t('s25.title')}</h1>
            <p className="m-0 text-[14px] font-medium text-hint">{t('s25.sub')}</p>
          </div>
          <button type="button" aria-label={t('s25.addAria')} onClick={() => void friendsActions.shareInvite(t)} className="qd-press qd-icon-btn">
            <Icon glyph="userPlus" size={22} stroke={2.2} />
          </button>
        </header>

        <section aria-label={t('s25.ref.title')} className="qd-card-gold qd-glint qd-in qd-d1 relative flex flex-col gap-3.5 rounded-[30px] p-[18px]">
          <div className="flex items-center gap-3.5">
            <div aria-hidden="true" className="qd-bob relative h-14 w-16 shrink-0">
              <span className="qd-ball absolute top-2 left-0 h-11 w-11" style={{ '--qd-ball': '#FFD36B', '--qd-ball-glow': 'var(--qd-gold-glow)', color: '#3A2600' } as CSSProperties}>
                <Icon glyph="coin" size={22} stroke={2.3} />
              </span>
              <span className="qd-ball absolute top-0 right-0 h-[34px] w-[34px]" style={{ '--qd-ball': '#3BE58B', '--qd-ball-glow': 'var(--qd-ok-glow)', color: '#04261A' } as CSSProperties}>
                <Icon glyph="userPlus" size={17} stroke={2.4} />
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">{t('s25.ref.title')}</h2>
              <p className="m-0 text-[13px] leading-[1.4] font-medium" style={{ color: 'var(--qd-gold-text)' }}>
                {t('s25.ref.text', { me: REFERRAL.inviter, coinsMe: pw(t, REFERRAL.inviter, 'coin'), fr: REFERRAL.friend, coinsFr: pw(t, REFERRAL.friend, 'coin') })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="qd-glass flex flex-col gap-px rounded-[18px] px-3 py-[9px]">
              <span className="qd-num text-[19px] font-bold">{num(data?.ref.invited ?? 0)}</span>
              <span className="text-[12px] font-medium text-hint">{t('s25.ref.invited')}</span>
            </div>
            <div className="qd-glass flex flex-col gap-px rounded-[18px] px-3 py-[9px]">
              <span className="qd-num flex items-center gap-[5px] text-[19px] font-bold" style={{ color: 'var(--qd-gold-text)' }}>
                <span aria-hidden="true" className="qd-ball h-[18px] w-[18px]" style={{ '--qd-ball': '#FFD36B', color: '#3A2600', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.6)' } as CSSProperties}>
                  <Icon glyph="coin" size={11} stroke={2.8} />
                </span>
                {num(data?.ref.earned ?? 0)}
              </span>
              <span className="text-[12px] font-medium text-hint">{t('s25.ref.earned')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="grow">
              <Button size="m" icon={<Icon glyph="send" size={20} stroke={2.4} />} onClick={() => void friendsActions.shareInvite(t)}>
                {t('s25.ref.invite')}
              </Button>
            </div>
            <button
              type="button"
              aria-label={t('s25.ref.copyAria')}
              onClick={() => void friendsActions.copyInvite()}
              className="qd-press qd-ball h-12 w-12 cursor-pointer border-0 p-0"
              style={{ '--qd-ball': '#9B5CFF', '--qd-ball-glow': 'var(--qd-brand-glow)', color: '#FFFFFF' } as CSSProperties}
            >
              <Icon glyph="copy" size={19} />
            </button>
          </div>
        </section>

        {list.isPending && [0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="qd-skel qd-glass h-[72px] rounded-[24px]" />)}
        {list.isError && !data && (
          <div className="qd-card flex items-center gap-3 rounded-[26px] p-4">
            <span className="min-w-0 grow text-[14px] leading-[1.35] font-medium text-hint">{t('toast.loadFailed')}</span>
            <Button variant="secondary" size="s" full={false} onClick={() => void list.refetch()} disabled={list.isFetching}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {data && data.incoming.length > 0 && (
          <section className="qd-in qd-d2 flex flex-col gap-2.5">
            <H2>
              {t('s25.incoming')}
              <span className="qd-chip qd-chip-brand qd-num h-6! px-[9px]!">{num(data.incoming.length)}</span>
            </H2>
            {data.incoming.map((f) => (
              <FriendRow
                key={f.player.id}
                f={f}
                status="request"
                action="accept"
                onAction={() => void friendsActions.respond(f.player, true)}
                onDecline={() => void friendsActions.respond(f.player, false)}
              />
            ))}
          </section>
        )}

        {data && data.friends.length > 0 && (
          <section className="qd-in qd-d2 flex flex-col gap-2.5">
            <H2>
              {t('s25.all', { n: num(data.friends.length) })}
              {onlineN > 0 && (
                <span className="qd-chip qd-chip-ok qd-num h-6! px-[9px]!">
                  <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full" style={{ background: 'var(--qd-correct)', boxShadow: '0 0 8px var(--qd-ok-glow)' }} />
                  {t('s25.online', { n: num(onlineN) })}
                </span>
              )}
            </H2>
            {data.friends.map((f) => (
              <FriendRow
                key={f.player.id}
                f={f}
                status={f.status}
                action={f.status === 'ingame' ? 'busy' : 'challenge'}
                onAction={() => friendsActions.challenge(f.player, me.docsAccepted)}
              />
            ))}
          </section>
        )}

        {data && data.friends.length === 0 && data.incoming.length === 0 && (
          <div className="qd-card qd-in qd-d2 flex flex-col items-center gap-2 rounded-[26px] px-[18px] py-[22px] text-center">
            <span aria-hidden="true" className="qd-ball qd-bob mb-1 h-14 w-14" style={{ '--qd-ball': '#9B5CFF', '--qd-ball-glow': 'var(--qd-brand-glow)', color: '#FFFFFF' } as CSSProperties}>
              <Icon glyph="users" size={26} stroke={2.2} />
            </span>
            <span className="text-[17px] font-bold">{t('s25.emptyTitle')}</span>
            <span className="max-w-[290px] text-[13px] leading-[1.4] font-medium text-hint">{t('s25.emptyText')}</span>
          </div>
        )}

        {data && data.recent.length > 0 && (
          <section className="qd-in qd-d3 flex flex-col gap-2.5">
            <div className="mx-1 mt-1 flex flex-col gap-0.5">
              <h2 className="m-0 text-[19px] font-bold tracking-[-0.02em]">{t('s25.recent')}</h2>
              <span className="text-[12px] leading-[1.4] font-medium text-hint">{t('s25.recentHint')}</span>
            </div>
            {data.recent.map((f) => (
              <FriendRow
                key={f.player.id}
                f={f}
                status="recent"
                action={f.sent || sent[f.player.id] ? 'sent' : 'add'}
                onAction={() => void friendsActions.request(f.player)}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
