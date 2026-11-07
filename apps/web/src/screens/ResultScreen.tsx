import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TIMINGS, type GameView, type RatingChange } from '@quiz-duel/shared';
import { Achievement, ACH_GLYPH } from '../components/Achievement';
import { useAuroraTone } from '../components/Aurora';
import { Avatar } from '../components/Avatar';
import { RematchBanner, RematchWaitBanner } from '../components/Banner';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { Notice } from '../components/Notice';
import { ReactionBubble, Reactions } from '../components/Reactions';
import { Burst, Trophy, type TrophyTone } from '../components/Trophy';
import { useCountUp, useReducedMotion } from '../hooks/useMotion';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { formatNumber } from '../i18n';
import { formatSec, signed } from '../lib/format';
import { gameActions, showToast, useGame } from '../lib/game';
import { haptic } from '../lib/telegram';

type Look = 'win' | 'loss' | 'draw' | 'techWin' | 'techLoss';

/** Сфера итога: победа - золотой кубок с лучами, поражение - красный крестик, ничья - фиолетовые мечи. */
const TONE: Record<Look, TrophyTone> = { win: 'gold', techWin: 'gold', loss: 'red', techLoss: 'red', draw: 'violet' };

/** Изменение рейтинга - глянцевый бейдж: рост зелёный, падение красный, ноль - стекло. */
const DELTA = {
  up: { bg: 'radial-gradient(circle at 30% 25%, #B6FFD6, #3BE58B)', fg: '#04261A', glow: '0 0 14px var(--qd-ok-glow)' },
  down: { bg: 'radial-gradient(circle at 30% 25%, #FFC2CF, #FF5A7A)', fg: '#2E0310', glow: '0 0 14px var(--qd-bad-glow)' },
  flat: { bg: 'var(--qd-glass)', fg: 'var(--tg-theme-text-color)', glow: 'var(--qd-glass-edge-flat)' },
} as const;

/** Плитка цифры итогов: значение крупно, подпись мелко; у рейтинга - бейдж изменения. */
function StatCard({ value, label, badge, muted = false }: { value: string; label: string; badge?: ReactNode; muted?: boolean }) {
  return (
    <div className="qd-card relative flex flex-col items-center gap-[3px] rounded-[22px] px-1.5 pt-3 pb-2.5 text-center">
      <span className="qd-num text-[19px] font-bold whitespace-nowrap" style={{ color: muted ? 'var(--tg-theme-hint-color)' : undefined }}>
        {value}
      </span>
      <span className="text-[12px] font-medium text-hint">{label}</span>
      {badge}
    </div>
  );
}

/** Рейтинг после партии: число досчитывает от прежнего значения за 900 мс, бейдж «+16» выпрыгивает. */
function RatingCard({ rating }: { rating: RatingChange | null }) {
  const { t, i18n } = useTranslation();
  const reduced = useReducedMotion();
  const [target, setTarget] = useState(rating?.before ?? 0);
  useEffect(() => {
    if (rating) setTarget(rating.after);
  }, [rating]);
  const shown = useCountUp(target, 900, reduced, 200);
  if (!rating) return <StatCard value="·" label={t('s12.ratingPending')} muted />;
  const d = rating.delta > 0 ? DELTA.up : rating.delta < 0 ? DELTA.down : DELTA.flat;
  return (
    <StatCard
      value={formatNumber(shown, i18n.language)}
      label={t('s12.ratingLabel')}
      badge={
        <span
          className="qd-pop qd-num absolute -top-2.5 right-1.5 flex h-[22px] items-center rounded-[11px] px-2 text-[12px] font-bold"
          style={{ background: d.bg, boxShadow: d.glow, color: d.fg }}
        >
          {signed(rating.delta, i18n.language)}
        </span>
      }
    />
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

  const sharing = useGame((st) => Boolean(st.pending.share));
  // Победа - аврора с золотом.
  useAuroraTone(look === 'win' || look === 'techWin' ? 'gold' : 'default');

  if (!result || !look) return <CancelledScreen game={game} />;

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
  const rm = game.rematch;
  const offeredToMe = rm?.status === 'offered' && !rm.byMe;
  const iOffered = rm?.status === 'offered' && rm.byMe;
  const note = rematchNote(game, look);

  return (
    <main className="qd-screen relative flex flex-col gap-3 overflow-hidden pt-[calc(var(--tg-viewport-safe-area-inset-top,0px)+var(--tg-viewport-content-safe-area-inset-top,0px)+14px)]!">
      <header className="relative flex flex-col items-center gap-1 text-center">
        <Trophy tone={TONE[look]} rays={won} />
        <h1
          className="qd-in qd-d2 m-0 leading-[1.08] font-bold tracking-[-0.03em]"
          style={{ fontSize: won ? 46 : 40, textShadow: won ? '0 0 30px var(--qd-gold-glow), var(--qd-text-glow)' : 'none' }}
        >
          {t(`s12.title.${look}`)}
        </h1>
        {result.technical && (
          <span className={`qd-in qd-d3 qd-chip mt-0.5 ${look === 'techWin' ? 'qd-chip-gold' : 'qd-chip-bad'}`}>
            <Icon glyph="offline" size={14} stroke={2.5} />
            {t(`s12.${look}`)}
          </span>
        )}
        <p className="qd-in qd-d3 m-0 mt-0.5 text-[16px] font-medium text-hint">{sub}</p>
      </header>

      <section aria-label={t('s12.scoreAria')} className="qd-card qd-in qd-d4 relative flex items-center gap-2 rounded-[26px] px-3.5 py-3">
        <ReactionBubble userId={game.me.userId} side="me" className="-top-6 left-3" />
        {opp && <ReactionBubble userId={opp.userId} side="opp" className="-top-6 right-3" />}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} size={44} ring="me" on="none" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-hint">{t('common.you')}</span>
            <span
              className="qd-num text-[clamp(19px,6.6vw,26px)] font-bold tracking-[-0.02em] whitespace-nowrap"
              style={{ color: 'var(--qd-me-text)', textShadow: '0 0 16px var(--qd-me-glow)' }}
            >
              {formatNumber(game.me.score, lang)}
            </span>
          </div>
        </div>
        <span aria-hidden="true" className="text-[22px] font-medium" style={{ color: 'var(--qd-dash)' }}>
          :
        </span>
        {opp && (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
            <div className="flex min-w-0 flex-col items-end">
              <span className="max-w-full truncate text-[13px] font-medium text-hint">{opp.name || t('score.opp')}</span>
              <span
                className="qd-num text-[clamp(19px,6.6vw,26px)] font-bold tracking-[-0.02em] whitespace-nowrap"
                style={{ color: 'var(--qd-opp-text)', textShadow: '0 0 16px var(--qd-opp-glow)' }}
              >
                {formatNumber(opp.score, lang)}
              </span>
            </div>
            <button
              type="button"
              aria-label={t('s12.oppAria', { opp: opp.name })}
              onClick={() => gameActions.openOpp(opp.userId)}
              className="qd-press flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-px"
            >
              <Avatar
                id={opp.userId}
                name={opp.name}
                photoUrl={opp.photoUrl}
                size={44}
                ring="opp"
                on="none"
                badge={look === 'techWin' || opp.left || !opp.online ? 'offline' : 'none'}
              />
            </button>
          </div>
        )}
      </section>

      <section className="qd-in qd-d5 grid grid-cols-3 gap-2.5">
        <RatingCard rating={result.rating ?? null} />
        <StatCard value={`${stats.correct}/${stats.played}`} label={t('s12.correctLabel')} />
        <StatCard value={stats.avgMs === null ? '-' : formatSec(stats.avgMs, t, lang)} label={t('s12.avgLabel')} />
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
          <div role="status" className="qd-pop flex min-h-5 items-center justify-center gap-1.5 text-center text-[14px] font-semibold text-hint">
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
          <Button disabled={!rm?.canOffer || busy} icon={<Icon glyph="rematch" size={22} stroke={2.4} />} onClick={() => void gameActions.rematchOffer()}>
            {t('s12.rematch')}
          </Button>
        )}
        <Button
          variant="secondary"
          size="m"
          disabled={sharing}
          icon={<Icon glyph="share" size={20} stroke={2.4} />}
          onClick={() =>
            void gameActions.shareResult(
              t(`s12.shareText.${result.outcome}`, { me: formatNumber(game.me.score, lang), opp: formatNumber(opp?.score ?? 0, lang) }),
            )
          }
        >
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

      {won && <Burst />}

      {offeredToMe && opp && rm.expiresAt && (
        <div
          className="qd-toast-in fixed inset-x-4 z-20 mx-auto max-w-[560px] rounded-[28px]"
          style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 28px)', boxShadow: '0 -14px 36px rgba(3, 4, 20, 0.4)' }}
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
    <main className="qd-screen flex flex-col">
      <div className="grow" />
      <div className="qd-in">
        <Notice glyph="clock" title={t(`s12.cancelled.${key}.title`)} text={t(`s12.cancelled.${key}.text`)} />
      </div>
      <div className="grow" />
      <div className="qd-in qd-d2">
        <Button variant="secondary" onClick={gameActions.goHome}>
          {t('s12.home')}
        </Button>
      </div>
    </main>
  );
}
