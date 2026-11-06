import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MeResponse, PlayerStats } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CATEGORY_LOOK } from '../components/Category';
import { Icon } from '../components/Icon';
import { MatchRow } from '../components/MatchRow';
import { Notice } from '../components/Notice';
import { StatTile } from '../components/StatTile';
import { TabDock } from '../components/TabDock';
import { formatNumber } from '../i18n';
import { api, queryKeys } from '../lib/api';
import { formatSec, percent } from '../lib/format';
import { gameActions } from '../lib/game';

/** Восемь плиток статистики: игры, победы, поражения, ничьи, винрейт, точность, ср. время, лучшая серия. */
export function statTiles(s: PlayerStats | null, t: (k: string) => string, lang: string) {
  const n = (v: number) => formatNumber(v, lang);
  return [
    { key: 'games', value: s ? n(s.games) : '0' },
    { key: 'wins', value: s ? n(s.wins) : '0' },
    { key: 'losses', value: s ? n(s.losses) : '0' },
    { key: 'draws', value: s ? n(s.draws) : '0' },
    { key: 'winrate', value: s ? percent(s.wins, s.games) : '-' },
    { key: 'accuracy', value: s ? percent(s.correct, s.questionsPlayed) : '-' },
    { key: 'avgTime', value: s?.avgCorrectMs != null ? formatSec(s.avgCorrectMs, t as never, lang) : '-' },
    { key: 'bestStreak', value: s ? n(s.bestStreak) : '0' },
  ].map((x) => ({ ...x, label: t(`s16.stats.${x.key}`) }));
}

/** Экран 16: профиль - цифры, точность по категориям и история матчей (тап - разбор). */
export function ProfileScreen({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  const p = profile.data;
  const newbie = p ? p.stats.games === 0 : me.games === 0;
  const stats = p?.stats ?? null;

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen qd-screen-in flex flex-col gap-4 pb-[120px]!">
        <header className="flex items-center gap-3.5">
          <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={72} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[22px] font-black">{me.firstName}</span>
              {me.username && <span className="truncate text-[14px] font-semibold text-hint">@{me.username}</span>}
            </div>
            <div className="qd-num flex items-center gap-1.5">
              <span className="flex h-6 items-center gap-1 rounded-xl px-2.5 text-[13px] font-extrabold" style={{ background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' }}>
                <Icon glyph="rating" size={13} stroke={2.5} />
                {formatNumber(stats?.rating ?? me.rating, lang)}
              </span>
              <span className="flex h-6 items-center rounded-xl bg-section px-2.5 text-[13px] font-bold text-hint">
                {stats?.place ? t('s03.place', { n: formatNumber(stats.place, lang) }) : t('s03.newbie')}
              </span>
            </div>
          </div>
        </header>

        <section aria-label={t('s16.statsAria')} aria-busy={profile.isPending} className="grid grid-cols-4 gap-2">
          {statTiles(newbie ? null : stats, t, lang).map((s) => (
            <StatTile key={s.key} value={profile.isPending ? '·' : s.value} label={s.label} muted={newbie || profile.isPending} />
          ))}
        </section>

        {profile.isError && (
          <div className="flex flex-col gap-3">
            <Notice glyph="alert" title={t('s16.error')} text={t('toast.loadFailed')} />
            <Button variant="secondary" onClick={() => void profile.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {p && newbie && (
          <div className="flex flex-col items-center gap-2.5 rounded-[24px] bg-section px-[18px] pt-[22px] pb-[18px] text-center">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand-text">
              <Icon glyph="duel" size={26} stroke={2.2} />
            </span>
            <span className="text-[17px] font-extrabold">{t('s16.newbieTitle')}</span>
            <span className="max-w-[280px] text-[13px] leading-[1.4] font-semibold text-hint">{t('s16.newbieText')}</span>
            <div className="mt-1.5 w-full">
              <Button icon={<Icon glyph="duel" size={22} stroke={2.5} />} onClick={() => gameActions.openCreate(me.docsAccepted)}>
                {t('s16.create')}
              </Button>
            </div>
          </div>
        )}

        {p && !newbie && (
          <>
            <section className="flex flex-col gap-2.5">
              <h2 className="m-0 ml-1 text-[17px] font-extrabold">{t('s16.cats')}</h2>
              <div className="flex flex-col gap-3 rounded-[20px] bg-section p-3.5">
                {p.categories.map((c) => {
                  const pct = c.answered ? Math.round((c.correct / c.answered) * 100) : 0;
                  const label = t(`cat.${c.category}.title`);
                  return (
                    <div key={c.category} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-[14px] font-bold">
                        <span className="flex text-hint">
                          <Icon glyph={CATEGORY_LOOK[c.category].glyph} size={16} stroke={2.2} />
                        </span>
                        <span className="min-w-0 grow truncate">{label}</span>
                        <span className="qd-num font-black">{c.answered ? `${pct}%` : '-'}</span>
                      </div>
                      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-[3px] bg-surface-2">
                        <div className="h-1.5 rounded-[3px]" style={{ width: `${pct}%`, background: 'var(--qd-brand)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="m-0 ml-1 text-[17px] font-extrabold">{t('s16.history')}</h2>
              {p.matches.map((m) => (
                <MatchRow key={m.gameId} match={m} onPress={() => gameActions.openReview(m.gameId)} />
              ))}
            </section>
          </>
        )}
      </main>
      <TabDock active="profile" />
    </div>
  );
}
