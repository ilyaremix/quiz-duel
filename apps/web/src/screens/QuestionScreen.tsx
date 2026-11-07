import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { TIMINGS, type GameView } from '@quiz-duel/shared';
import { Answer, type AnswerState } from '../components/Answer';
import { Avatar } from '../components/Avatar';
import { Ball, BALLS } from '../components/Ball';
import { DisconnectBanner, OfflineStrip } from '../components/Banner';
import { CategoryChip } from '../components/CategoryTile';
import { Icon, type IconGlyph } from '../components/Icon';
import { ReactionPicker, reactionName, useLiveReaction } from '../components/Reactions';
import { ReactionGlyph } from '../components/Art';
import { RulesStrip } from '../components/Modes';
import { ScoreBar } from '../components/ScoreBar';
import { Timer } from '../components/Timer';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { useCountUp, useReducedMotion } from '../hooks/useMotion';
import { formatNumber } from '../i18n';
import { gameActions, useGame } from '../lib/game';
import { haptic } from '../lib/telegram';

const LETTERS = ['A', 'B', 'C', 'D'];

type PillLook = { bg: string; edge: string; fg: string; ic: string; icFg: string; glyph: IconGlyph };
type Pill = PillLook & { text: string; label: string };

/** Плашки итога вопроса: верно - зелёное стекло, неверно - красное, не успел - простое стекло. */
const OK: PillLook = { bg: 'var(--qd-ok-glass)', edge: 'var(--qd-ok-edge)', fg: 'var(--tg-theme-text-color)', ic: '#3BE58B', icFg: '#04261A', glyph: 'check' };
const BAD: PillLook = { bg: 'var(--qd-bad-glass)', edge: 'var(--qd-bad-edge)', fg: 'var(--tg-theme-text-color)', ic: '#FF5A7A', icFg: '#2E0310', glyph: 'close' };
const LATE: PillLook = {
  bg: 'var(--qd-sheen), var(--qd-glass)',
  edge: 'var(--qd-glass-edge-flat)',
  fg: 'var(--tg-theme-hint-color)',
  ic: 'var(--qd-chip)',
  icFg: 'var(--tg-theme-hint-color)',
  glyph: 'clock',
};

/** Кромка живой зоны; «соперник уже ответил» - горячая оранжевая. */
const EDGE = 'var(--qd-glass-edge)';
const HOT = 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 0 0 1.5px var(--qd-opp-ring), 0 0 26px var(--qd-opp-glow), 0 12px 30px rgba(3, 4, 20, 0.3)';

/**
 * Низкий экран: всё, что выше вариантов, ужимается (вместо плашки «соперник думает» - строка под счётом,
 * кнопка реакций - в углу карточки вопроса, капсулы ответов 56 px) - иначе на телефонах высотой 640-667 px
 * (iPhone SE, недорогие Android) вариант D оказывался за экраном.
 * Решение одно на всю сессию: экран сразу ниже 760 px или обычный вид не поместился хотя бы раз.
 * Обратно не переключаемся, чтобы вёрстка не прыгала между вопросами.
 */
let compactScreen = typeof window !== 'undefined' && window.innerHeight < 760;

/** Что показывает живая зона между таймером и вопросом. */
type Presence = {
  mode: 'think' | 'done' | 'ball';
  glyph?: IconGlyph;
  title: string;
  sub: string;
  edge: string;
  color?: string;
  dots?: boolean;
};

/**
 * Экраны 9-11, 21 и 22 - один экран партии, который рисуется только из снимка сервера:
 * вопрос и таймер → мой выбор («Ответ принят») → раскрытие с верным вариантом,
 * выбором обоих и очками. Таймер считается по часам сервера (с поправкой на сбитые
 * часы телефона), поэтому у обоих игроков он одинаковый. Между таймером и вопросом -
 * живая зона: что делает соперник прямо сейчас, на раскрытии - итог вопроса у обоих.
 */
export function QuestionScreen({ game }: { game: GameView }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const reduced = useReducedMotion();
  const offline = useGame((s) => s.conn !== 'online' || !s.net);
  const picked = useGame((s) => s.picked);
  const q = game.question!;
  const opp = game.opponent;
  const solo = game.mode === 'solo';
  const reveal = game.phase === 'reveal' ? game.reveal : null;
  const [compact, setCompact] = useState(compactScreen);
  const mainRef = useRef<HTMLElement | null>(null);
  // До отрисовки: обычный вид выше экрана - сразу компактный (без мигания).
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (compact || !main || main.offsetHeight <= window.innerHeight + 2) return;
    compactScreen = true;
    setCompact(true);
  }, [compact, q.index, game.phase]);

  // Мой выбор: из снимка или только что нажатый (ещё летит на сервер).
  const pickedHere = picked && picked.gameId === game.id && picked.index === q.index ? picked.position : null;
  const myPos = reveal ? reveal.me.position : (game.myAnswer?.position ?? pickedHere);
  const answered = myPos !== null;

  // Счёт пересчитывается за 300 мс на раскрытии.
  const meScore = useCountUp(game.me.score, 300, reduced);
  const oppScore = useCountUp(opp?.score ?? 0, 300, reduced);

  // На раскрытии: success за верный, error за неверный или «время вышло». Один раз на вопрос.
  const buzzed = useRef(-1);
  useEffect(() => {
    if (!reveal || buzzed.current === reveal.index) return;
    buzzed.current = reveal.index;
    if (reveal.me.position === reveal.correctPosition) haptic.success();
    else haptic.error();
  }, [reveal]);

  const oppOffline = Boolean(opp && !opp.online);
  const oppAnswered = !reveal && game.opponentAnswered;
  const oppState = oppOffline ? 'offline' : oppAnswered ? 'answered' : 'none';
  const oppName = opp?.name || t('score.opp');

  const options = q.options.map((text, i) => {
    let state: AnswerState = 'default';
    let cls = 'qd-cascade';
    if (reveal) {
      if (i === reveal.correctPosition) state = 'correct';
      else if (i === reveal.me.position) state = 'wrong';
      else if (i === reveal.opponent?.position) state = 'default';
      else state = 'dimmed';
      // Вспышка у верного, тряска - только у моего неверного (сигнал ошибки).
      cls = i === reveal.correctPosition ? 'qd-flash' : i === reveal.me.position ? 'qd-shake' : '';
    } else if (answered) {
      state = i === myPos ? 'selected' : 'dimmed';
    }
    return { text, state, cls, i };
  });

  const pill = (pos: number | null, pts: number, who: string): Pill => {
    if (pos === null) return { text: t('s09.timeout'), label: t('s09.pillLate', { who }), ...LATE };
    if (reveal && pos === reveal.correctPosition)
      return { text: `+${formatNumber(pts, lang)}`, label: t('s09.pillOk', { who, n: formatNumber(pts, lang) }), ...OK };
    return { text: '+0', label: t('s09.pillBad', { who }), ...BAD };
  };

  // Очки взлетают у счёта в момент раскрытия - только за верный ответ.
  const meGain = reveal && reveal.me.position === reveal.correctPosition && reveal.me.points > 0 ? `+${formatNumber(reveal.me.points, lang)}` : '';
  const oppGain =
    reveal && opp && reveal.opponent && reveal.opponent.position === reveal.correctPosition && reveal.opponent.points > 0
      ? `+${formatNumber(reveal.opponent.points, lang)}`
      : '';

  let presence: Presence | null = null;
  // На низком экране плашки живой зоны нет: «Соперник ответил» показывает строка под счётом (ScoreBar).
  if (!reveal && !compact) {
    if (offline) presence = { mode: 'ball', glyph: 'offline', title: t('s09.offline'), sub: '', edge: EDGE, color: 'var(--qd-gold-text)' };
    else if (solo || !opp) presence = { mode: 'ball', glyph: 'bolt', title: t('s09.fast'), sub: t('s09.soloHint'), edge: EDGE };
    else if (oppOffline) presence = null;
    else if (answered) presence = { mode: oppAnswered ? 'done' : 'think', title: t('s09.locked'), sub: t('s09.waiting'), edge: EDGE };
    else if (oppAnswered)
      presence = { mode: 'done', title: t('s09.oppDone', { opp: oppName }), sub: t('s09.yourMove'), edge: HOT, color: 'var(--qd-opp-text)' };
    else presence = { mode: 'think', title: t('s09.thinking', { opp: oppName }), sub: t('s09.fast'), edge: EDGE, dots: true };
  }

  return (
    <main ref={mainRef} className={`qd-screen qd-fade-in flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {offline && (
        <div className="qd-strip-in -mx-4 -mt-4">
          <OfflineStrip title={t('banner.offline.title')} />
        </div>
      )}

      <ScoreBar
        me={{ id: game.me.userId, name: game.me.name, photoUrl: game.me.photoUrl, score: formatNumber(meScore, lang), glow: game.me.glow }}
        opp={opp ? { id: opp.userId, name: opp.name, photoUrl: opp.photoUrl, score: formatNumber(oppScore, lang), glow: opp.glow } : null}
        current={q.index + 1}
        total={q.total}
        oppState={oppState}
        meState={!reveal && answered ? 'answered' : 'none'}
        best={solo ? (game.soloBest ? formatNumber(game.soloBest, lang) : '-') : undefined}
        meGain={meGain}
        oppGain={oppGain}
        hideNote={!compact}
      />

      <RulesStrip
        rules={game.rules}
        meName={t('common.you')}
        oppName={opp ? oppName : null}
        meLives={game.me.lives}
        oppLives={opp?.lives ?? null}
        doubled={q.doubled}
      />

      {!reveal && <QuestionTimer startedAt={q.startedAt} endsAt={q.endsAt} reduced={reduced} answered={answered} />}

      {oppOffline && opp?.graceEndsAt != null && <GraceBanner graceEndsAt={opp.graceEndsAt} />}

      {/* Живая зона: соперник думает / уже ответил, мой ответ принят; на раскрытии - итог вопроса у обоих.
          На низком экране во время вопроса её нет - остаётся только точка, откуда всплывают реакции. */}
      {compact && !reveal ? (
        <div className="relative -mb-2 h-0">
          {!solo && <LiveReaction userId={game.me.userId} side="me" />}
          {!solo && opp && <LiveReaction userId={opp.userId} side="opp" />}
        </div>
      ) : (
        <div className={`relative flex grow flex-col items-center justify-center ${compact ? '' : 'min-h-[72px]'}`}>
          {presence && <PresencePill key={`${presence.mode}:${presence.title}`} presence={presence} opp={opp ?? null} />}

          {reveal && (
            <div className={`qd-pop grid w-full gap-2.5 ${opp && reveal.opponent ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <RevealPill side="me" pill={pill(reveal.me.position, reveal.me.points, t('common.you'))} avatar={game.me} />
              {opp && reveal.opponent && <RevealPill side="opp" pill={pill(reveal.opponent.position, reveal.opponent.points, oppName)} avatar={opp} />}
            </div>
          )}

          {!solo && <LiveReaction userId={game.me.userId} side="me" />}
          {!solo && opp && <LiveReaction userId={opp.userId} side="opp" />}
        </div>
      )}

      {/* Реакции - кнопкой над вопросом в любой момент партии; строка всегда на месте, вёрстка не прыгает. */}
      {opp && !solo && !compact && <ReactionPicker />}

      <section
        className={`qd-card relative flex flex-col items-center rounded-[30px] px-5 text-center ${compact ? 'gap-2 pt-2.5 pb-3.5' : 'gap-3 pt-5 pb-6'}`}
      >
        {opp && !solo && compact && <ReactionPicker variant="corner" />}
        <CategoryChip cat={q.category} />
        <h1 className={`m-0 font-semibold tracking-[-0.01em] ${compact ? 'text-[18px] leading-[1.25]' : 'text-[22px] leading-[1.3]'}`}>{q.text}</h1>
      </section>

      {/* Новый вопрос - новые элементы: варианты заново выезжают каскадом по 50 мс. */}
      <div key={q.index} role="group" aria-label={t('s09.optionsAria')} className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
        {options.map((o) => (
          <div key={o.i} className={o.cls} style={o.cls === 'qd-cascade' ? { animationDelay: `${o.i * 50}ms` } : undefined}>
            <Answer
              text={o.text}
              letter={LETTERS[o.i]}
              state={o.state}
              disabled={offline}
              me={reveal && o.i === reveal.me.position ? { id: game.me.userId, name: game.me.name, photoUrl: game.me.photoUrl } : undefined}
              opp={reveal && opp && o.i === reveal.opponent?.position ? { id: opp.userId, name: opp.name, photoUrl: opp.photoUrl } : undefined}
              onPress={() => void gameActions.answer(o.i)}
              compact={compact}
            />
          </div>
        ))}
      </div>

    </main>
  );
}

/**
 * Таймер вопроса по дедлайну сервера. Своим компонентом: 10 раз в секунду перерисовывается только он,
 * а не весь экран с вариантами и счётом. Без анимаций - раз в секунду. Время на ответ - из настроек
 * партии (5-20 с), по умолчанию 15 с. Вибрация - тики на последних 3 секундах, пока не ответил.
 */
function QuestionTimer({ startedAt, endsAt, reduced, answered }: { startedAt: number; endsAt: number; reduced: boolean; answered: boolean }) {
  const now = useServerNow(reduced ? 250 : 100);
  const totalMs = Math.max(1000, endsAt - startedAt);
  const totalSec = Math.round(totalMs / 1000);
  const leftMs = Math.max(0, endsAt - now);
  const sec = Math.min(totalSec, Math.ceil(leftMs / 1000));
  const pct = reduced ? (sec / totalSec) * 100 : (leftMs / totalMs) * 100;
  useEffect(() => {
    if (!answered && sec >= 1 && sec <= 3) haptic.tick();
  }, [sec, answered]);
  return <Timer seconds={sec} total={totalSec} pct={pct} live={!reduced} />;
}

/** «Соперник отключился. Техническая победа через 0:24» - обратный отсчёт своим компонентом. */
function GraceBanner({ graceEndsAt }: { graceEndsAt: number }) {
  const { t } = useTranslation();
  const now = useServerNow(250);
  return (
    <div className="qd-toast-in">
      <DisconnectBanner title={t('banner.disconnect.title')} text={t('banner.disconnect.text')} time={formatClock(graceEndsAt - now)} />
    </div>
  );
}

/** Плашка живой зоны: аватар соперника с крутящейся дугой (думает) или галочкой (ответил), либо шар-иконка. */
function PresencePill({ presence: p, opp }: { presence: Presence; opp: { userId: number; name: string; photoUrl: string | null } | null }) {
  return (
    <div
      role="status"
      className="qd-card qd-pop box-border flex max-w-full items-center gap-3 rounded-[26px] py-[9px] pr-[18px] pl-[9px]"
      style={{ boxShadow: p.edge, transition: 'box-shadow 200ms ease' }}
    >
      <div className="relative h-10 w-10 shrink-0">
        {p.mode === 'ball' || !opp ? (
          <Ball size={40} {...BALLS.gold}>
            <Icon glyph={p.glyph ?? 'bolt'} size={20} stroke={2.4} />
          </Ball>
        ) : (
          <>
            <Avatar id={opp.userId} name={opp.name} photoUrl={opp.photoUrl} size={40} ring="opp" on="none" />
            {p.mode === 'think' && (
              <svg className="qd-spin absolute -top-[5px] -left-[5px]" aria-hidden="true" width="50" height="50" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="23" fill="none" strokeWidth="2.5" style={{ stroke: 'var(--qd-opp)', strokeOpacity: 0.22 }} />
                <path d="M25 2a23 23 0 0 1 23 23" fill="none" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: 'var(--qd-opp)' }} />
              </svg>
            )}
            {p.mode === 'done' && (
              <span
                aria-hidden="true"
                className="qd-pop qd-ball absolute -right-[5px] -bottom-[5px] h-5 w-5"
                style={{ '--qd-ball': '#3BE58B', color: '#04261A', boxShadow: '0 0 0 2.5px var(--qd-ring-gap), 0 0 10px var(--qd-ok-glow)' } as CSSProperties}
              >
                <Icon glyph="check" size={11} stroke={3.5} />
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center text-[15px] leading-[1.25] font-semibold" style={{ color: p.color ?? 'var(--tg-theme-text-color)' }}>
          <span className="min-w-0">{p.title}</span>
          {p.dots && (
            <span className="qd-wait" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
        {p.sub && <span className="text-[12px] font-medium text-hint">{p.sub}</span>}
      </div>
    </div>
  );
}

/** Реакция всплывает в живой зоне и тает за 1,8 с: соперника - справа (оранжевое кольцо), моя - слева (синее). */
function LiveReaction({ userId, side }: { userId: number; side: 'me' | 'opp' }) {
  const { t } = useTranslation();
  const live = useLiveReaction(userId);
  if (!live) return null;
  const me = side === 'me';
  return (
    <div
      key={live.id}
      role="img"
      aria-label={t('reactions.from', { r: reactionName(t, live.emoji) })}
      className={`qd-react-up pointer-events-none absolute bottom-1 z-[3] flex h-[54px] w-[54px] items-center justify-center rounded-full ${me ? 'left-5' : 'right-5'}`}
      style={{
        background: 'var(--qd-sheen), var(--qd-glass-solid)',
        boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 0 0 2px var(${me ? '--qd-me' : '--qd-opp'}), 0 0 22px var(${me ? '--qd-me-glow' : '--qd-opp-glow'}), 0 10px 24px rgba(3, 4, 20, 0.35)`,
      }}
    >
      <ReactionGlyph r={live.emoji} size={38} live />
    </div>
  );
}

function RevealPill({ side, pill, avatar }: { side: 'me' | 'opp'; pill: Pill; avatar: { userId: number; name: string; photoUrl: string | null } }) {
  const me = side === 'me';
  const av = <Avatar id={avatar.userId} name={avatar.name} photoUrl={avatar.photoUrl} size={30} ring={side} on="none" />;
  const ic = (
    <span
      aria-hidden="true"
      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
      style={{ background: pill.ic, color: pill.icFg, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5)' }}
    >
      <Icon glyph={pill.glyph} size={13} stroke={3.2} />
    </span>
  );
  return (
    <div
      role="status"
      aria-label={pill.label}
      className={`qd-num box-border flex h-12 min-w-0 items-center gap-1.5 rounded-[24px] text-[15px] font-bold whitespace-nowrap ${me ? 'pr-3 pl-[7px]' : 'justify-end pr-[7px] pl-3'}`}
      style={{ background: pill.bg, boxShadow: pill.edge, color: pill.fg }}
    >
      {me && av}
      {me && ic}
      <span className={`${me ? 'qd-pts' : 'qd-pts-2'} min-w-0 truncate`}>{pill.text}</span>
      {!me && ic}
      {!me && av}
    </div>
  );
}
