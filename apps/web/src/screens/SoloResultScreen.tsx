import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameView } from '@quiz-duel/shared';
import { Achievement, ACH_GLYPH } from '../components/Achievement';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Notice } from '../components/Notice';
import { useReducedMotion } from '../hooks/useMotion';
import { formatNumber } from '../i18n';
import { formatSec } from '../lib/format';
import { gameActions, showToast, useGame } from '../lib/game';
import { haptic } from '../lib/telegram';
import { Confetti } from './ResultScreen';

const PILL = 'qd-num flex h-[34px] items-center rounded-[17px] px-3.5 text-[14px] font-extrabold';

/** Экран 19: итог тренировки - счёт против рекорда категории, «Новый рекорд!» с конфетти. */
export function SoloResultScreen({ game }: { game: GameView }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const reduced = useReducedMotion();
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

  const actions = (
    <div className="flex flex-col gap-3">
      <Button disabled={busy} icon={<Icon glyph="rematch" size={22} stroke={2.5} />} onClick={() => void gameActions.startSolo(game.category)}>
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
      <main className="qd-screen qd-screen-in flex flex-col">
        <div className="grow" />
        <Notice glyph="clock" title={t('s19.noAnswers.title')} text={t('s19.noAnswers.text')} />
        <div className="grow" />
        {actions}
      </main>
    );
  }

  const rec = Boolean(solo?.record);
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
    <main className="qd-screen qd-fade-in relative flex flex-col gap-3.5 overflow-hidden">
      {rec && !reduced && <Confetti />}
      <header className="relative flex flex-col items-center gap-1.5 text-center">
        <div
          aria-hidden="true"
          className="qd-pop mt-2.5 mb-2 flex h-[104px] w-[104px] items-center justify-center rounded-full"
          style={rec ? { background: 'var(--qd-gold-tint)', color: 'var(--qd-gold)' } : { background: 'var(--qd-brand-tint)', color: 'var(--qd-brand-text)' }}
        >
          <Icon glyph={rec ? 'rating' : 'target'} size={54} stroke={2} />
        </div>
        <h1 className="qd-rise m-0 text-[40px] leading-[1.1] font-black">{t(rec ? 's19.record' : 's19.title')}</h1>
        <p className="qd-rise m-0 text-[15px] font-bold text-hint">{t(`cat.${game.category}.title`)}</p>
      </header>

      <section aria-label={t('s19.scoreAria')} className="qd-rise-2 flex items-center gap-2 rounded-[24px] bg-section px-4 py-3.5 shadow-[0_4px_0_var(--qd-lip)]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} size={42} ring="me" on="card" />
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-hint">{t('common.you')}</span>
            <span className="qd-num text-[22px] font-black text-me-text">{n(game.me.score)}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="flex flex-col items-end">
            <span className="text-[13px] font-bold whitespace-nowrap text-hint">{t(rec ? 's19.prevBest' : 's19.best')}</span>
            <span className="qd-num text-[22px] font-black text-gold-text">{prev ? n(prev) : '-'}</span>
          </div>
          <span aria-hidden="true" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gold-tint text-gold">
            <Icon glyph="rating" size={20} stroke={2.2} />
          </span>
        </div>
      </section>

      <section className="qd-rise-2 flex flex-wrap justify-center gap-2">
        {chip && (
        <span
          className={PILL}
          aria-busy={!solo}
          style={rec ? { background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' } : { background: 'var(--tg-theme-section-bg-color)', color: 'var(--tg-theme-hint-color)' }}
        >
          {chip}
        </span>
        )}
        {stats && <span className={`${PILL} bg-section`}>{t('s19.correct', { n: `${stats.correct}/${stats.played}` })}</span>}
        {stats && <span className={`${PILL} bg-section`}>{t('s19.avg', { t: stats.avgMs === null ? '-' : formatSec(stats.avgMs, t, lang) })}</span>}
      </section>

      <p className="qd-rise-2 m-0 flex items-center justify-center gap-1.5 text-[13px] font-bold text-hint">
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
    </main>
  );
}
