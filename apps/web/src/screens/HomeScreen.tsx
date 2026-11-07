import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Ball, BALLS } from '../components/Ball';
import { ResumeBanner } from '../components/Banner';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { MatchRow } from '../components/MatchRow';
import { formatNumber } from '../i18n';
import { api, queryKeys } from '../lib/api';
import { gameActions, useGame } from '../lib/game';
import { pw, shop, useShop, useWallet } from '../lib/economy';

function ModeCard({ glyph, tone, title, hint, onPress }: { glyph: IconGlyph; tone: 'brand' | 'gold'; title: string; hint: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="qd-press qd-card flex min-h-[116px] cursor-pointer flex-col items-start gap-[3px] rounded-[26px] border-0 px-3.5 pt-3.5 pb-4 text-left text-text"
    >
      <Ball size={42} {...BALLS[tone]} className="mb-2">
        <Icon glyph={glyph} size={22} stroke={2.2} />
      </Ball>
      <span className="text-[17px] font-bold tracking-[-0.01em]">{title}</span>
      <span className="text-[13px] font-medium text-hint">{hint}</span>
    </button>
  );
}

/** Экран 3: главная. Шапка игрока, «Дуэль с другом», быстрая игра и тренировка, последние матчи. */
export function HomeScreen({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const game = useGame((s) => s.game);
  const hidden = useGame((s) => s.hidden);
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  const wallet = useWallet();
  const w = wallet.data;
  const dailyBusy = useShop((s) => Boolean(s.busy.daily));
  const stats = profile.data?.stats;
  const recent = profile.data?.matches.slice(0, 3) ?? [];
  const newbie = (stats?.games ?? me.games) === 0;
  const rating = stats?.rating ?? me.rating;

  const resume = game && hidden;
  // Пока игрок был на главной, партия закончилась: плашка ведёт на итоги.
  const ended = game?.phase === 'finished';
  const qn = game?.question ? game.question.index + 1 : 1;

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen flex flex-col gap-3.5 pb-[120px]!">
        <header className="qd-in flex items-center gap-3">
          <button
            type="button"
            aria-label={t('s03.profileAria')}
            onClick={() => gameActions.setTab('profile')}
            className="qd-press -m-1 flex h-[60px] w-[60px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0"
          >
            <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={52} ring="me" on="none" glow={w?.glow} />
          </button>
          <div className="flex min-w-0 grow flex-col gap-[7px]">
            <h1 className="m-0 truncate text-[23px] font-bold tracking-[-0.02em]">{t('s03.greeting', { me: me.firstName })}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="qd-chip qd-chip-gold qd-num">
                <Icon glyph="rating" size={14} stroke={2.6} />
                {formatNumber(rating, i18n.language)}
                {stats?.place ? (
                  <span className="font-semibold opacity-75">· {t('s03.placeShort', { n: formatNumber(stats.place, i18n.language) })}</span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={t('s03.coinsAria', { n: formatNumber(w?.coins ?? 0, i18n.language), coins: pw(t, w?.coins ?? 0, 'coin') })}
                onClick={() => {
                  shop.setSection('items');
                  gameActions.setTab('shop');
                }}
                className="qd-press qd-chip qd-num cursor-pointer border-0 pr-2 pl-[3px]"
              >
                <span
                  aria-hidden="true"
                  className="qd-ball h-[22px] w-[22px]"
                  style={{ '--qd-ball': '#FFD36B', '--qd-ball-glow': 'var(--qd-gold-glow)', color: '#3A2600', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.6), 0 0 10px var(--qd-gold-glow)' } as CSSProperties}
                >
                  <Icon glyph="coin" size={12} stroke={2.8} />
                </span>
                {w ? formatNumber(w.coins, i18n.language) : '…'}
                <span aria-hidden="true" className="flex" style={{ color: 'var(--qd-brand-text)' }}>
                  <Icon glyph="plus" size={13} stroke={3} />
                </span>
              </button>
            </div>
          </div>
          <button type="button" aria-label={t('s03.settings')} onClick={gameActions.openSettings} className="qd-press qd-icon-btn">
            <Icon glyph="settings" size={22} stroke={2.2} />
          </button>
        </header>

        {w && !w.daily.claimed && (
          <div role="region" aria-label={t('s03.daily.title')} className="qd-card-gold qd-glint qd-in qd-d1 flex items-center gap-3 rounded-[26px] py-2.5 pr-2.5 pl-3">
            <span aria-hidden="true" className="qd-ball qd-bob h-11 w-11" style={{ '--qd-ball': '#FFD36B', '--qd-ball-glow': 'var(--qd-gold-glow)', color: '#3A2600' } as CSSProperties}>
              <Icon glyph="gift" size={22} stroke={2.3} />
            </span>
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <span className="text-[15px] font-bold">{t('s03.daily.title')}</span>
              <span className="qd-num text-[13px] font-semibold" style={{ color: 'var(--qd-gold-text)' }}>
                {t('s03.daily.text', { d: w.daily.day, n: w.daily.reward, coins: pw(t, w.daily.reward, 'coin') })}
              </span>
            </div>
            <button
              type="button"
              disabled={dailyBusy}
              onClick={() => void shop.claimDaily(t)}
              className="qd-press box-border h-10 shrink-0 cursor-pointer rounded-[20px] border-0 px-4 text-[14px] font-bold disabled:opacity-60"
              style={{ background: 'var(--qd-cta-bg)', boxShadow: 'var(--qd-cta-edge)', color: 'var(--qd-cta-fg)' }}
            >
              {t('s03.daily.action')}
            </button>
          </div>
        )}

        {resume && (
          <div className="qd-in qd-d1">
          <ResumeBanner
            title={ended ? t('banner.resume.endedTitle') : t('banner.resume.title')}
            text={
              ended
                ? game.result
                  ? t(`banner.resume.ended.${game.result.outcome}`, { me: formatNumber(game.me.score, i18n.language), opp: formatNumber(game.opponent?.score ?? 0, i18n.language) })
                  : ''
                : game.opponent
                  ? ['waiting', 'lobby'].includes(game.phase)
                    ? t('banner.resume.textLobby', { opp: game.opponent.name })
                    : t('banner.resume.text', { opp: game.opponent.name, n: qn })
                  : ''
            }
            action={ended ? t('banner.resume.endedAction') : t('banner.resume.action')}
            onAction={gameActions.returnToGame}
          />
          </div>
        )}

        <section aria-label={t('s03.heroTitle')} className="qd-card qd-glint qd-in qd-d1 rounded-[32px]">
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-[32px]"
            style={{
              background:
                'radial-gradient(80% 70% at 100% 0%, rgba(155, 92, 255, 0.5), rgba(155, 92, 255, 0) 70%), radial-gradient(70% 70% at 0% 100%, rgba(79, 141, 255, 0.38), rgba(79, 141, 255, 0) 70%)',
            }}
          />
          <div className="relative z-[1] flex flex-col gap-4 p-[22px]">
            <div aria-hidden="true" className="flex h-[60px] items-center">
              <div className="qd-bob">
                <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={56} ring="me" on="none" glow={w?.glow} />
              </div>
              <span className="qd-vs relative z-[2] -mx-2">VS</span>
              <div className="relative h-14 w-14">
                <span className="qd-ripple absolute inset-0 rounded-full" />
                <span className="qd-ripple qd-r2 absolute inset-0 rounded-full" />
                <div
                  className="relative flex h-14 w-14 items-center justify-center rounded-full text-[24px] font-bold"
                  style={{
                    background: 'linear-gradient(155deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.05)), var(--qd-glass)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.18), 0 0 22px var(--qd-opp-glow)',
                    color: 'var(--qd-opp-text)',
                  }}
                >
                  ?
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="m-0 text-[30px] leading-[1.05] font-bold tracking-[-0.03em] whitespace-nowrap">{t('s03.heroTitle')}</h2>
              <p className="m-0 text-[15px] leading-[1.4] font-medium text-hint">{t('s03.heroText')}</p>
            </div>
            <Button icon={<Icon glyph="duel" size={22} stroke={2.4} />} onClick={() => gameActions.openCreate(me.docsAccepted)}>
              {t('s03.create')}
            </Button>
          </div>
        </section>

        <section className="qd-in qd-d2 grid grid-cols-2 gap-3">
          <ModeCard glyph="bolt" tone="brand" title={t('s03.quick')} hint={t('s03.quickHint')} onPress={() => void gameActions.quickJoin(me.docsAccepted)} />
          <ModeCard glyph="target" tone="gold" title={t('s03.training')} hint={t('s03.trainingHint')} onPress={() => gameActions.openSolo(me.docsAccepted)} />
        </section>

        <section className="qd-in qd-d3 mt-1 flex flex-col gap-2.5">
          <div className="flex min-h-11 items-center justify-between">
            <h2 className="m-0 ml-1 text-[19px] font-bold tracking-[-0.02em]">{t('s03.recent')}</h2>
            {recent.length > 0 && (
              <Button variant="ghost" size="s" full={false} onClick={() => gameActions.setTab('profile')}>
                {t('s03.recentAll')}
              </Button>
            )}
          </div>
          {recent.map((m) => (
            <MatchRow key={m.gameId} match={m} onPress={() => gameActions.openReview(m.gameId)} />
          ))}
          {profile.isError && !profile.data && (
            <div className="qd-card flex items-center gap-3 rounded-[26px] p-4">
              <Ball size={40} {...BALLS.bad}>
                <Icon glyph="alert" size={20} stroke={2.2} />
              </Ball>
              <span className="min-w-0 grow text-[14px] leading-[1.35] font-medium text-hint">{t('s03.recentFailed')}</span>
              <div className="shrink-0">
                <Button variant="secondary" size="s" full={false} onClick={() => void profile.refetch()} disabled={profile.isFetching}>
                  {t('common.retry')}
                </Button>
              </div>
            </div>
          )}
          {profile.data && recent.length === 0 && (
            <div className="qd-card flex flex-col items-center gap-2 rounded-[26px] p-5 text-center">
              <Ball size={48} {...BALLS.brand} className="mb-1">
                <Icon glyph="medal" size={24} stroke={2.2} />
              </Ball>
              <span className="text-[16px] font-bold">{t('s03.emptyTitle')}</span>
              <span className="max-w-[280px] text-[13px] leading-[1.4] font-medium text-hint">{t('s03.emptyText')}</span>
            </div>
          )}
          {profile.isPending &&
            [0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="qd-skel qd-glass h-[58px] rounded-[24px]" />)}
        </section>
      </main>
    </div>
  );
}
