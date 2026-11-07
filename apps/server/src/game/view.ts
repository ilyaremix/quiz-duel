import {
  OPEN_PHASES,
  TIMINGS,
  type DraftView,
  type GameResultView,
  type GameView,
  type Lang,
  type PlayerProfile,
  type PlayerView,
  type ResultStats,
  type RevealSide,
  type RematchView,
} from '@quiz-duel/shared';
import type { QuestionBank } from '../questions/bank.js';
import { isGone, limitMs, livesLeft, otherOf, outcomeFor, playerOf, rematchAvailable, rulesOf, type GameState, type PlayerState } from './machine.js';
import { isDoubled } from '@quiz-duel/shared';

/** Выбор темы в «Миксе» глазами игрока: тему соперника видно только после показа. */
function draftFor(state: GameState, me: PlayerState): DraftView | null {
  if (!state.draft || state.phase !== 'draft') return null;
  const mine = state.draft.players.find((p) => p.userId === me.userId);
  const opp = state.draft.players.find((p) => p.userId !== me.userId);
  if (!mine) return null;
  return {
    offers: mine.offers,
    myPick: mine.pick,
    oppPicked: Boolean(opp?.pick),
    revealed: state.draft.revealed,
    oppPick: state.draft.revealed ? (opp?.pick ?? null) : null,
  };
}

/** Карточка игрока по id; нет данных - нейтральная заглушка (имя покажется инициалом «?»). */
export type ProfileLookup = (userId: number) => PlayerProfile | undefined;

const UNKNOWN: PlayerProfile = { name: '', username: null, photoUrl: null, rating: 1000, glow: 'none' };

const playerView = (state: GameState, p: PlayerState, profileOf: ProfileLookup): PlayerView => ({
  ...(profileOf(p.userId) ?? UNKNOWN),
  // После подсчёта итогов - рейтинг именно после этой партии (а не из кэша карточек).
  ...(state.settlement?.players.some((s) => s.userId === p.userId)
    ? { rating: state.settlement.players.find((s) => s.userId === p.userId)!.after }
    : {}),
  userId: p.userId,
  ready: p.ready,
  online: p.online,
  graceEndsAt: p.graceEndsAt,
  // Так же считает машина: место соперника освобождается через 60 с офлайна в лобби.
  seatFreesAt:
    OPEN_PHASES.includes(state.phase) && state.opponent?.userId === p.userId && !p.online && p.offlineSince !== null
      ? p.offlineSince + TIMINGS.lobbyOfflineMs
      : null,
  score: p.score,
  left: Boolean(p.left),
  lives: livesLeft(state, p),
});

/** Цифры игрока за сыгранные (закрытые) вопросы. */
export function statsOf(state: GameState, p: PlayerState): ResultStats {
  const answers = p.answers.slice(0, state.closed).filter((a) => a !== null);
  return {
    correct: answers.filter((a) => a.correct).length,
    played: state.closed,
    avgMs: answers.length ? Math.round(answers.reduce((sum, a) => sum + a.timeMs, 0) / answers.length) : null,
  };
}

function resultFor(state: GameState, me: PlayerState): GameResultView | null {
  const outcome = outcomeFor(state, me.userId);
  if (!state.finish || !outcome) return null;
  const technical = state.finish.reason !== 'completed';
  const winner = state.finish.winnerId;
  const mine = state.settlement?.players.find((p) => p.userId === me.userId) ?? null;
  return {
    reason: state.finish.reason,
    outcome,
    technical,
    leaverId: technical && winner !== null ? (otherOf(state, winner)?.userId ?? null) : null,
    stats: statsOf(state, me),
    rating: mine && state.mode !== 'solo' ? { before: mine.before, after: mine.after, delta: mine.delta } : null,
    newAchievements: mine?.achievements ?? [],
    solo: state.mode === 'solo' ? (state.settlement?.solo ?? null) : null,
  };
}

/** Что видит игрок о реванше на итогах. */
export function rematchFor(state: GameState, me: PlayerState): RematchView | null {
  if (state.phase !== 'finished' || state.mode === 'solo') return null;
  const opp = otherOf(state, me.userId);
  const r = state.rematch ?? null;
  const live = r?.status === 'offered';
  const open = !r || r.status === 'cancelled';
  let blocked: RematchView['blocked'] = null;
  if (!rematchAvailable(state)) blocked = 'technical';
  else if (!open && !(live && r.by !== me.userId)) blocked = live ? null : 'closed';
  else if (me.left || isGone(opp)) blocked = 'opponentLeft';
  return {
    status: r && r.status !== 'cancelled' ? r.status : null,
    byMe: r?.by === me.userId,
    expiresAt: live ? r.expiresAt : null,
    nextGameId: r?.nextId ?? null,
    // Своё предложение уже висит - нажимать нечего; встречное - нажатие означает согласие.
    canOffer: blocked === null && !(live && r.by === me.userId),
    blocked,
  };
}

/**
 * Снимок партии для одного игрока на его языке. Верный вариант и чужой выбор
 * появляются только в фазе раскрытия, когда вопрос уже закрыт. null - не участник.
 */
export function viewFor(
  state: GameState,
  viewerId: number,
  lang: Lang,
  bank: QuestionBank,
  now: number,
  profileOf: ProfileLookup = () => undefined,
): GameView | null {
  const me = playerOf(state, viewerId);
  if (!me) return null;
  const opp = otherOf(state, viewerId);
  const i = state.questionIndex;
  const live = state.phase === 'question' || state.phase === 'reveal';
  const gq = live ? state.questions[i] : undefined;
  const source = gq ? bank.byId.get(gq.id) : undefined;

  let reveal: GameView['reveal'] = null;
  if (state.phase === 'reveal' && gq && source) {
    const side = (p: PlayerState): RevealSide => {
      const a = p.answers[i];
      return { position: a?.position ?? null, points: a?.points ?? 0, timeMs: a?.timeMs ?? null };
    };
    reveal = {
      index: i,
      correctPosition: gq.order.indexOf(source.correct),
      me: side(me),
      opponent: opp ? side(opp) : null,
    };
  }

  const myCurrent = state.phase === 'question' ? me.answers[i] : undefined;

  return {
    id: state.id,
    mode: state.mode,
    category: state.category,
    phase: state.phase,
    rev: state.rev,
    serverNow: now,
    phaseEndsAt: state.phaseEndsAt,
    lobbyExpiresAt: state.lobbyExpiresAt,
    creatorId: state.creator.userId,
    me: playerView(state, me, profileOf),
    opponent: opp ? playerView(state, opp, profileOf) : null,
    question:
      gq && source
        ? {
            index: i,
            total: state.questions.length,
            questionId: gq.id,
            category: source.category,
            text: source[lang].text,
            options: gq.order.map((o) => source[lang].options[o]!),
            startedAt: state.questionStartedAt!,
            endsAt: state.questionStartedAt! + limitMs(state),
            doubled: isDoubled(rulesOf(state), i, state.questions.length),
          }
        : null,
    myAnswer: myCurrent ? { position: myCurrent.position } : null,
    opponentAnswered: state.phase === 'question' && Boolean(opp?.answers[i]),
    reveal,
    rules: rulesOf(state),
    draft: draftFor(state, me),
    result: resultFor(state, me),
    cancelReason: state.cancelReason,
    rematchOf: state.rematchOf,
    rematch: rematchFor(state, me),
    soloBest: state.mode === 'solo' ? (state.soloBest ?? null) : null,
  };
}
