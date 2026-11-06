import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TIMINGS, type GameView } from '@quiz-duel/shared';
import { Answer, type AnswerState } from '../components/Answer';
import { Avatar } from '../components/Avatar';
import { DisconnectBanner, OfflineStrip } from '../components/Banner';
import { CATEGORY_LOOK } from '../components/Category';
import { Icon, type IconGlyph } from '../components/Icon';
import { ScoreBar } from '../components/ScoreBar';
import { Timer } from '../components/Timer';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { useCountUp, useReducedMotion } from '../hooks/useMotion';
import { formatNumber } from '../i18n';
import { gameActions, useGame } from '../lib/game';
import { haptic } from '../lib/telegram';

type Pill = { text: string; label: string; bg: string; fg: string; glyph: IconGlyph };

const OK = { bg: 'var(--qd-correct-tint)', fg: 'var(--qd-correct-text)', glyph: 'check' } as const;
const BAD = { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong-text)', glyph: 'close' } as const;
const LATE = { bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-hint-color)', glyph: 'clock' } as const;

/**
 * Экраны 9-11, 21 и 22 - один экран партии, который рисуется только из снимка сервера:
 * вопрос и таймер → мой выбор («Ждём соперника…») → раскрытие с верным вариантом,
 * выбором обоих и очками. Таймер считается по часам сервера (с поправкой на сбитые
 * часы телефона), поэтому у обоих игроков он одинаковый.
 */
export function QuestionScreen({ game }: { game: GameView }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const now = useServerNow(100);
  const reduced = useReducedMotion();
  const offline = useGame((s) => s.conn !== 'online');
  const picked = useGame((s) => s.picked);
  const q = game.question!;
  const opp = game.opponent;
  const reveal = game.phase === 'reveal' ? game.reveal : null;

  // Мой выбор: из снимка или только что нажатый (ещё летит на сервер).
  const pickedHere = picked && picked.gameId === game.id && picked.index === q.index ? picked.position : null;
  const myPos = reveal ? reveal.me.position : (game.myAnswer?.position ?? pickedHere);
  const answered = myPos !== null;

  // Таймер: по дедлайну сервера. Без анимаций - раз в секунду.
  const leftMs = Math.max(0, q.endsAt - now);
  const sec = Math.min(15, Math.ceil(leftMs / 1000));
  const pct = reduced ? (sec / 15) * 100 : (leftMs / TIMINGS.questionMs) * 100;

  // Счёт пересчитывается за 300 мс на раскрытии.
  const meScore = useCountUp(game.me.score, 300, reduced);
  const oppScore = useCountUp(opp?.score ?? 0, 300, reduced);

  // Вибрация: тики на последних 3 секундах, пока не ответил.
  useEffect(() => {
    if (!reveal && !answered && sec >= 1 && sec <= 3) haptic.tick();
  }, [sec, reveal, answered]);

  // На раскрытии: success за верный, error за неверный или «время вышло». Один раз на вопрос.
  const buzzed = useRef(-1);
  useEffect(() => {
    if (!reveal || buzzed.current === reveal.index) return;
    buzzed.current = reveal.index;
    if (reveal.me.position === reveal.correctPosition) haptic.success();
    else haptic.error();
  }, [reveal]);

  const oppOffline = Boolean(opp && !opp.online);
  const oppState = oppOffline ? 'offline' : !reveal && game.opponentAnswered ? 'answered' : 'none';

  const look = CATEGORY_LOOK[q.category];

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

  const status: { glyph: IconGlyph; text: string } | null = offline
    ? { glyph: 'offline', text: t('s09.offline') }
    : !reveal && answered
      ? { glyph: 'clock', text: t('s09.waiting') }
      : null;

  return (
    <main className="qd-screen qd-fade-in flex flex-col gap-4">
      {offline && (
        <div className="qd-strip-in -mx-4 -mt-4">
          <OfflineStrip title={t('banner.offline.title')} />
        </div>
      )}

      <ScoreBar
        me={{ id: game.me.userId, name: game.me.name, photoUrl: game.me.photoUrl, score: formatNumber(meScore, lang) }}
        opp={opp ? { id: opp.userId, name: opp.name, photoUrl: opp.photoUrl, score: formatNumber(oppScore, lang) } : null}
        current={q.index + 1}
        total={q.total}
        oppState={oppState}
        meState={!reveal && answered ? 'answered' : 'none'}
      />

      {!reveal && <Timer seconds={sec} pct={pct} live={!reduced} />}

      {oppOffline && opp?.graceEndsAt != null && (
        <div className="qd-toast-in">
          <DisconnectBanner title={t('banner.disconnect.title')} text={t('banner.disconnect.text')} time={formatClock(opp.graceEndsAt - now)} />
        </div>
      )}

      {reveal && (
        <div className={`grid gap-2.5 ${opp ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <RevealPill side="me" pill={pill(reveal.me.position, reveal.me.points, t('common.you'))} avatar={game.me} />
          {opp && reveal.opponent && (
            <RevealPill side="opp" pill={pill(reveal.opponent.position, reveal.opponent.points, opp.name || t('score.opp'))} avatar={opp} />
          )}
        </div>
      )}

      <section className="flex flex-col items-center gap-3 rounded-[24px] bg-section px-5 pt-5 pb-6 text-center shadow-[0_4px_0_var(--qd-lip)]">
        <span className="flex h-7 items-center gap-1.5 rounded-[14px] bg-surface-2 px-3 text-[13px] font-extrabold" style={{ color: look.fg }}>
          <Icon glyph={look.glyph} size={14} stroke={2.5} />
          {t(`cat.${q.category}.title`)}
        </span>
        <h1 className="m-0 text-[22px] leading-[1.3] font-extrabold">{q.text}</h1>
      </section>

      <div className="grow" />

      {/* Новый вопрос - новые элементы: варианты заново выезжают каскадом по 50 мс. */}
      <div key={q.index} role="group" aria-label={t('s09.optionsAria')} className="flex flex-col gap-3.5">
        {options.map((o) => (
          <div key={o.i} className={o.cls} style={o.cls === 'qd-cascade' ? { animationDelay: `${o.i * 50}ms` } : undefined}>
            <Answer
              text={o.text}
              state={o.state}
              disabled={offline}
              me={reveal && o.i === reveal.me.position ? { id: game.me.userId, name: game.me.name, photoUrl: game.me.photoUrl } : undefined}
              opp={reveal && opp && o.i === reveal.opponent?.position ? { id: opp.userId, name: opp.name, photoUrl: opp.photoUrl } : undefined}
              onPress={() => void gameActions.answer(o.i)}
            />
          </div>
        ))}
      </div>

      <div role="status" className="flex h-7 items-center justify-center gap-2 text-[15px] font-bold text-hint">
        {status && (
          <span key={status.text} className="qd-rise flex items-center gap-2">
            <Icon glyph={status.glyph} size={16} stroke={2.5} />
            {status.text}
          </span>
        )}
      </div>
    </main>
  );
}

function RevealPill({ side, pill, avatar }: { side: 'me' | 'opp'; pill: Pill; avatar: { userId: number; name: string; photoUrl: string | null } }) {
  const me = side === 'me';
  const av = <Avatar id={avatar.userId} name={avatar.name} photoUrl={avatar.photoUrl} size={28} ring={side} on="none" />;
  return (
    <div
      role="status"
      aria-label={pill.label}
      className={`qd-num box-border flex h-10 items-center gap-2 rounded-[20px] text-[15px] font-extrabold whitespace-nowrap ${me ? 'pr-3 pl-1.5' : 'justify-end pr-1.5 pl-3'}`}
      style={{ background: pill.bg, color: pill.fg }}
    >
      {me && av}
      <Icon glyph={pill.glyph} size={16} stroke={3} />
      <span className={me ? 'qd-pts' : 'qd-pts-2'}>{pill.text}</span>
      {!me && av}
    </div>
  );
}
