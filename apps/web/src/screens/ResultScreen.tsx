import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TIMINGS, type GameView, type RatingChange } from '@quiz-duel/shared';
import { Achievement, ACH_GLYPH } from '../components/Achievement';
import { Avatar } from '../components/Avatar';
import { RematchBanner, RematchWaitBanner } from '../components/Banner';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { Notice } from '../components/Notice';
import { ReactionBubble, Reactions } from '../components/Reactions';
import { useCountUp, useReducedMotion } from '../hooks/useMotion';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { formatNumber } from '../i18n';
import { formatSec, signed } from '../lib/format';
import { gameActions, showToast, useGame } from '../lib/game';
import { haptic } from '../lib/telegram';

type Look = 'win' | 'loss' | 'draw' | 'techWin' | 'techLoss';

const GOLD = { bg: 'var(--qd-gold-tint)', fg: 'var(--qd-gold)', glyph: 'rating', stroke: 2 } as const;
const RED = { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong)', glyph: 'close', stroke: 3 } as const;
const ICONS: Record<Look, { bg: string; fg: string; glyph: IconGlyph; stroke: number }> = {
  win: GOLD,
  techWin: GOLD,
  loss: RED,
  techLoss: RED,
  draw: { bg: 'var(--qd-brand-tint)', fg: 'var(--qd-brand-text)', glyph: 'duel', stroke: 2 },
};

const CONFETTI = ['var(--qd-me)', 'var(--qd-gold)', 'var(--qd-brand)', 'var(--qd-opp)', 'var(--qd-correct)'];

/** Конфетти на победу: ~24 кусочка разлетаются один раз (в режиме без анимаций скрыты). */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => {
        const round = i % 3 === 0;
        return {
          x: `${((14 + ((i * 61) % 360)) / 390) * 100}%`,
          y: 10 + ((i * 47) % 210),
          w: round ? 9 + (i % 4) : 14,
          h: round ? 9 + (i % 4) : 6,
          r: round ? 7 : 3,
          bg: CONFETTI[i % CONFETTI.length]!,
          rot: ((i * 37) % 180) - 90,
          rot2: 180 + ((i * 53) % 360),
          dx: ((i * 29) % 60) - 30,
          d: 1700 + ((i * 131) % 900),
          dl: (i * 43) % 420,
        };
      }),
    [],
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[260px] overflow-hidden">
      {pieces.map((c, i) => (
        <div
          key={i}
          className="qd-confetti absolute"
          style={
            {
              left: c.x,
              top: c.y,
              width: c.w,
              height: c.h,
              borderRadius: c.r,
              background: c.bg,
              transform: `rotate(${c.rot}deg)`,
              '--qd-dx': `${c.dx}px`,
              '--qd-rot': `${c.rot2}deg`,
              '--qd-cd': `${c.d}ms`,
              '--qd-cdl': `${c.dl}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const DELTA = {
  up: { bg: 'var(--qd-correct-tint)', fg: 'var(--qd-correct-text)' },
  down: { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong-text)' },
  flat: { bg: 'var(--tg-theme-section-bg-color)', fg: 'var(--tg-theme-text-color)' },
} as const;

const PILL = 'qd-num flex h-[34px] items-center rounded-[17px] px-3.5 text-[14px] font-extrabold';

/** «Рейтинг 1 016 (+16)»: число досчитывает от прежнего значения за 900 мс. */
function RatingPill({ rating }: { rating: RatingChange }) {
  const { t, i18n } = useTranslation();
  const reduced = useReducedMotion();
  const [target, setTarget] = useState(rating.before);
  useEffect(() => setTarget(rating.after), [rating.after]);
  const shown = useCountUp(target, 900, reduced, 200);
  const d = rating.delta > 0 ? DELTA.up : rating.delta < 0 ? DELTA.down : DELTA.flat;
  return (
    <span className={`qd-pop ${PILL}`} style={{ background: d.bg, color: d.fg }}>
      {t('s12.rating', { r: formatNumber(shown, i18n.language), d: signed(rating.delta, i18n.language) })}
    </span>
  );
}

/** Что написать под неактивной кнопкой «Реванш». */
function rematchNote(game: GameView, look: Look): { glyph: IconGlyph; key: string } | null {
  const r = game.rematch;
  if (!r) return null;
  if (r.blocked === 'technical') return { glyph: 'offline', key: look === 'techWin' ? 's12.rmLeft' : 's12.rmTech' };
  if (r.status === 'accepted') return { glyph: 'rematch', key: 's12.rmStarting' };
  if (r.status === 'declined') return { glyph: 'close', key: r.byMe ? 's12.rmDeclined' : 's12.rmDeclinedMe' };
  if (r.status === 'expired') return { glyph: 'clock', key: r.byMe ? 's12.rmExpired' : 's12.rmExpiredMe' };
  if (r.status === 'left' || r.blocked === 'opponentLeft') return { glyph: 'offline', key: 's12.rmLeft' };
  return null;
}

/**
 * Экран 12: итог партии из снимка сервера - рейтинг «+16», цифры партии и реванш (экран 13).
 * Новая ачивка партии - строкой под цифрами и тостом.
 */
export function ResultScreen({ game }: { game: GameView }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const reduced = useReducedMotion();
  const busy = useGame((st) => Boolean(st.pending.rematch));
  const result = game.result;
  const opp = game.opponent;

  const look: Look | null = !result
    ? null
    : result.technical
      ? result.outcome === 'win'
        ? 'techWin'
        : 'techLoss'
      : result.outcome;

  // Сильная вибрация на победу - один раз.
  const buzzed = useRef(false);
  useEffect(() => {
    if (buzzed.current || !look) return;
    buzzed.current = true;
    if (look === 'win' || look === 'techWin') haptic.win();
    else if (look === 'loss' || look === 'techLoss') haptic.error();
  }, [look]);

  // Новые ачивки партии: тост один раз на каждую (приходят вместе с рейтингом).
  const fresh = result?.newAchievements ?? [];
  const toasted = useRef<string | null>(null);
  useEffect(() => {
    const key = `${game.id}:${fresh.join(',')}`;
    if (fresh.length === 0 || toasted.current === key) return;
    toasted.current = key;
    const first = fresh[0]!;
    showToast('achievement', fresh.length > 1 ? 'toast.achMany' : 'toast.ach', { name: t(`ach.${first}.t`), n: String(fresh.length - 1) }, ACH_GLYPH[first]);
    haptic.success();
  }, [game.id, fresh, t]);

  if (!result || !look) return <CancelledScreen game={game} />;

  const icon = ICONS[look];
  const won = look === 'win' || look === 'techWin';
  const iLeft = result.leaverId === game.me.userId;
  // Подзаголовок: кто ушёл и как - сдался сам или не вернулся за 30 с.
  const sub =
    look === 'techWin'
      ? t(result.reason === 'forfeit' ? 's12.sub.techWinForfeit' : 's12.sub.techWin', { opp: opp?.name })
      : look === 'techLoss'
        ? t(iLeft && result.reason === 'abandoned' ? 's12.sub.techLossAbandoned' : 's12.sub.techLoss')
        : t(`s12.sub.${look}`, { opp: opp?.name });
  const stats = result.stats;
  const soon = () => showToast('info', 'toast.soon');
  const rm = game.rematch;
  const offeredToMe = rm?.status === 'offered' && !rm.byMe;
  const iOffered = rm?.status === 'offered' && rm.byMe;
  const note = rematchNote(game, look);

  return (
    <main className="qd-screen qd-fade-in relative flex flex-col gap-3.5 overflow-hidden">
      {won && !reduced && <Confetti />}

      <header className="relative flex flex-col items-center gap-1.5 text-center">
        <div
          aria-hidden="true"
          className="qd-pop mt-2.5 mb-2 flex h-[104px] w-[104px] items-center justify-center rounded-full"
          style={{ background: icon.bg, color: icon.fg }}
        >
          <Icon glyph={icon.glyph} size={54} stroke={icon.stroke} />
        </div>
        <h1 className="qd-rise m-0 text-[40px] leading-[1.1] font-black">{t(`s12.title.${look}`)}</h1>
        {result.technical && (
          <span
            className="qd-rise flex h-7 items-center gap-1.5 rounded-[14px] px-3 text-[13px] font-extrabold"
            style={
              look === 'techWin'
                ? { background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' }
                : { background: 'var(--qd-wrong-tint)', color: 'var(--qd-wrong-text)' }
            }
          >
            <Icon glyph="offline" size={14} stroke={2.5} />
            {t(`s12.${look}`)}
          </span>
        )}
        <p className="qd-rise m-0 text-[15px] font-bold text-hint">{sub}</p>
      </header>

      <section
        aria-label={t('s12.scoreAria')}
        className="qd-rise-2 relative flex items-center gap-2 rounded-[24px] bg-section px-4 py-3.5 shadow-[0_4px_0_var(--qd-lip)]"
      >
        <ReactionBubble userId={game.me.userId} side="me" className="top-[-22px] left-3" />
        {opp && <ReactionBubble userId={opp.userId} side="opp" className="top-[-22px] right-3" />}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} size={42} ring="me" on="card" />
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-hint">{t('common.you')}</span>
            <span className="qd-num text-[22px] font-black text-me-text">{formatNumber(game.me.score, lang)}</span>
          </div>
        </div>
        <span className="text-[20px] font-black text-hint">:</span>
        {opp && (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <div className="flex min-w-0 flex-col items-end">
              <span className="max-w-full truncate text-[13px] font-bold text-hint">{opp.name || t('score.opp')}</span>
              <span className="qd-num text-[22px] font-black text-opp-text">{formatNumber(opp.score, lang)}</span>
            </div>
            <button
              type="button"
              aria-label={t('s12.oppAria', { opp: opp.name })}
              onClick={() => gameActions.openOpp(opp.userId)}
              className="qd-press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-px"
            >
              <Avatar
                id={opp.userId}
                name={opp.name}
                photoUrl={opp.photoUrl}
                size={42}
                ring="opp"
                on="card"
                badge={look === 'techWin' || opp.left || !opp.online ? 'offline' : 'none'}
              />
            </button>
          </div>
        )}
      </section>

      <section className="qd-rise-2 flex flex-wrap justify-center gap-2">
        {result.rating ? (
          <RatingPill rating={result.rating} />
        ) : (
          <span className={`${PILL} bg-section text-hint`} aria-busy="true">
            {t('s12.ratingPending')}
          </span>
        )}
        <span className={`${PILL} bg-section`}>{t('s12.correct', { n: `${stats.correct}/${stats.played}` })}</span>
        <span className={`${PILL} bg-section`}>{t('s12.avg', { t: stats.avgMs === null ? '-' : formatSec(stats.avgMs, t, lang) })}</span>
      </section>

      {fresh[0] && (
        <div className="qd-ach-in">
          <Achievement code={fresh[0]} state="new" />
        </div>
      )}

      {/* Реакции сопернику, пока он на итогах. */}
      {opp && !opp.left && opp.online && <Reactions size="s" />}

      <div className="grow" />

      <div className="flex flex-col gap-3">
        {note && !iOffered && (
          <div role="status" className="qd-pop flex min-h-5 items-center justify-center gap-1.5 text-center text-[14px] font-bold text-hint">
            <Icon glyph={note.glyph} size={16} stroke={2.5} />
            {t(note.key)}
          </div>
        )}
        {iOffered && opp && rm.expiresAt ? (
          <div className="qd-toast-in">
            <RematchCountdown expiresAt={rm.expiresAt}>
              {(left) => (
                <RematchWaitBanner
                  opp={{ id: opp.userId, name: opp.name, photoUrl: opp.photoUrl }}
                  title={t('banner.rematchWait.title')}
                  text={
                    <>
                      {t('banner.rematchWait.text')} · <span className="qd-num">{formatClock(left)}</span>
                    </>
                  }
                  progressLabel={t('banner.rematchWait.progress')}
                  left={left}
                  total={TIMINGS.rematchMs}
                  cancel={t('banner.rematchWait.action')}
                  busy={busy}
                  onCancel={() => void gameActions.rematchCancel()}
                />
              )}
            </RematchCountdown>
          </div>
        ) : offeredToMe ? null : (
          <Button
            disabled={!rm?.canOffer || busy}
            icon={<Icon glyph="rematch" size={22} stroke={2.5} />}
            onClick={() => void gameActions.rematchOffer()}
          >
            {t('s12.rematch')}
          </Button>
        )}
        <Button variant="secondary" size="m" icon={<Icon glyph="share" size={20} stroke={2.5} />} onClick={soon}>
          {t('s12.share')}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="s" onClick={() => gameActions.openReview(game.id)}>
            {t('s12.review')}
          </Button>
          <Button variant="ghost" size="s" onClick={gameActions.goHome}>
            {t('s12.home')}
          </Button>
        </div>
      </div>

      {offeredToMe && opp && rm.expiresAt && (
        <div
          className="qd-toast-in fixed inset-x-4 z-20 mx-auto max-w-[560px] rounded-[24px]"
          style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 32px)', boxShadow: '0 -12px 32px rgba(10, 8, 16, 0.35)' }}
        >
          <RematchCountdown expiresAt={rm.expiresAt}>
            {(left) => (
              <RematchBanner
                opp={{ id: opp.userId, name: opp.name, photoUrl: opp.photoUrl }}
                title={t('banner.rematch.title', { opp: opp.name })}
                text={
                  <>
                    {t(`cat.${game.category}.title`)} · <span className="qd-num">{formatClock(left)}</span>
                  </>
                }
                progressLabel={t('banner.rematch.progress')}
                left={left}
                total={TIMINGS.rematchMs}
                accept={t('banner.rematch.action')}
                decline={t('banner.rematch.action2')}
                busy={busy}
                onAccept={() => void gameActions.rematchRespond(true)}
                onDecline={() => void gameActions.rematchRespond(false)}
              />
            )}
          </RematchCountdown>
        </div>
      )}
    </main>
  );
}

/** Остаток 30 с на ответ по часам сервера (обновляется 10 раз в секунду). */
function RematchCountdown({ expiresAt, children }: { expiresAt: number; children: (leftMs: number) => ReactNode }) {
  const now = useServerNow(100);
  return <>{children(Math.max(0, expiresAt - now))}</>;
}

/** Никто не дал ни одного ответа - партия отменена без рейтинга. */
function CancelledScreen({ game }: { game: GameView }) {
  const { t } = useTranslation();
  const key = game.cancelReason === 'no_answers' ? 'noAnswers' : 'other';
  return (
    <main className="qd-screen qd-screen-in flex flex-col">
      <div className="grow" />
      <Notice glyph="clock" title={t(`s12.cancelled.${key}.title`)} text={t(`s12.cancelled.${key}.text`)} />
      <div className="grow" />
      <Button variant="secondary" onClick={gameActions.goHome}>
        {t('s12.home')}
      </Button>
    </main>
  );
}
