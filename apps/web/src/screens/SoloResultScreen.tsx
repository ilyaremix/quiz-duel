import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameView } from '@quiz-duel/shared';
import { Achievement, ACH_GLYPH } from '../components/Achievement';
import { useAuroraTone } from '../components/Aurora';
import { Avatar } from '../components/Avatar';
import { Ball, BALLS } from '../components/Ball';
import { Burst, Trophy } from '../components/Trophy';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Notice } from '../components/Notice';
import { formatNumber } from '../i18n';
import { formatSec } from '../lib/format';
import { gameActions, showToast, useGame } from '../lib/game';
import { haptic } from '../lib/telegram';

/** Капсулы цифр тренировки. */
const CHIP = { height: 34, padding: '0 14px', borderRadius: 17, fontSize: 14 } as const;

/** Экран 19: итог тренировки - счёт против рекорда категории, «Новый рекорд!» с конфетти. */
export function SoloResultScreen({ game }: { game: GameView }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const busy = useGame((s) => Boolean(s.pending['solo:start']));
  const result = game.result;
  const solo = result?.solo ?? null;
  const n = (v: number) => formatNumber(v, lang);

  const fresh = result?.newAchievements ?? [];
  const toasted = useRef<string | null>(null);
  useEffect(() => {
    if (!solo || toasted.current === game.id) return;
    toasted.current = game.id;
    if (solo.record) haptic.win();
    const first = fresh[0];
    if (first) showToast('achievement', 'toast.ach', { name: t(`ach.${first}.t`) }, ACH_GLYPH[first]);
  }, [game.id, solo, fresh, t]);

  const rec = Boolean(solo?.record);
  // Рекорд - аврора с золотом.
  useAuroraTone(rec ? 'gold' : 'default');

  const actions = (
    <div className="flex flex-col gap-3">
      <Button disabled={busy} icon={<Icon glyph="rematch" size={22} stroke={2.4} />} onClick={() => void gameActions.startSolo(game.category)}>
        {t('s19.again')}
      </Button>
      <Button variant="secondary" size="m" onClick={() => gameActions.openSolo(true)}>
        {t('s19.other')}
      </Button>
      <Button variant="ghost" size="s" onClick={gameActions.goHome}>
        {t('s19.home')}
      </Button>
    </div>
  );

  // Ни одного ответа - попытка не засчитана (или игрок вышел - тогда его уже увели на главную).
  if (game.phase === 'cancelled') {
    return (
      <main className="qd-screen flex flex-col">
        <div className="grow" />
        <div className="qd-in">
          <Notice glyph="clock" title={t('s19.noAnswers.title')} text={t('s19.noAnswers.text')} />
        </div>
        <div className="grow" />
        {actions}
      </main>
    );
  }

  const prev = solo?.prevBest ?? null;
  const chip = !solo
    ? t('s19.saving')
    : rec
      ? prev
        ? t('s19.plusRecord', { n: n(solo.score - prev) })
        : t('s19.firstRecord')
      : prev === null
        ? null
        : solo.score === prev
          ? t('s19.equalRecord')
          : t('s19.toRecord', { n: n(Math.max(0, prev - solo.score)) });
  const stats = result?.stats;

  return (
    <main className="qd-screen relative flex flex-col gap-3 overflow-hidden pt-[calc(var(--tg-viewport-safe-area-inset-top,0px)+var(--tg-viewport-content-safe-area-inset-top,0px)+14px)]!">
      <header className="relative flex flex-col items-center gap-1 text-center">
        <Trophy tone={rec ? 'gold' : 'violet'} glyph={rec ? 'rating' : 'target'} rays={rec} />
        <h1
          className="qd-in qd-d2 m-0 leading-[1.08] font-bold tracking-[-0.03em]"
          style={{ fontSize: rec ? 42 : 40, textShadow: rec ? '0 0 30px var(--qd-gold-glow), var(--qd-text-glow)' : 'none' }}
        >
          {t(rec ? 's19.record' : 's19.title')}
        </h1>
        <p className="qd-in qd-d2 m-0 mt-0.5 text-[16px] font-medium text-hint">{t(`cat.${game.category}.title`)}</p>
      </header>

      <section aria-label={t('s19.scoreAria')} className="qd-card qd-in qd-d4 flex items-center gap-2 rounded-[26px] px-3.5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} size={44} ring="me" on="none" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-hint">{t('common.you')}</span>
            <span
              className="qd-num text-[clamp(19px,6.6vw,26px)] font-bold tracking-[-0.02em] whitespace-nowrap"
              style={{ color: 'var(--qd-me-text)', textShadow: '0 0 16px var(--qd-me-glow)' }}
            >
              {n(game.me.score)}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
          <div className="flex min-w-0 flex-col items-end">
            <span className="text-[13px] font-medium whitespace-nowrap text-hint">{t(rec ? 's19.prevBest' : 's19.best')}</span>
            <span
              className="qd-num text-[clamp(19px,6.6vw,26px)] font-bold tracking-[-0.02em] whitespace-nowrap"
              style={{ color: 'var(--qd-gold-text)', textShadow: '0 0 16px var(--qd-gold-glow)' }}
            >
              {prev ? n(prev) : '-'}
            </span>
          </div>
          <Ball size={44} {...BALLS.gold}>
            <Icon glyph="rating" size={20} stroke={2.2} />
          </Ball>
        </div>
      </section>

      <section className="qd-in qd-d4 flex flex-wrap justify-center gap-2">
        {chip && (
          <span className={`qd-chip qd-num ${rec ? 'qd-chip-gold' : ''}`} aria-busy={!solo} style={{ ...CHIP, color: rec ? undefined : 'var(--tg-theme-hint-color)' }}>
            {chip}
          </span>
        )}
        {stats && (
          <span className="qd-chip qd-num" style={CHIP}>
            {t('s19.correct', { n: `${stats.correct}/${stats.played}` })}
          </span>
        )}
        {stats && (
          <span className="qd-chip qd-num" style={CHIP}>
            {t('s19.avg', { t: stats.avgMs === null ? '-' : formatSec(stats.avgMs, t, lang) })}
          </span>
        )}
      </section>

      <p className="qd-in qd-d4 m-0 flex items-center justify-center gap-1.5 text-[13px] font-medium text-hint">
        <Icon glyph="info" size={14} stroke={2.5} />
        {t('s19.noRating')}
      </p>

      {fresh[0] && (
        <div className="qd-ach-in">
          <Achievement code={fresh[0]} state="new" />
        </div>
      )}

      <div className="grow" />
      {actions}

      {rec && <Burst count={30} />}
    </main>
  );
}
