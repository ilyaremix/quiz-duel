import { OPEN_PHASES, TIMINGS, type GameView, type Lang, type PlayerProfile, type PlayerView, type RevealSide } from '@quiz-duel/shared';
import type { QuestionBank } from '../questions/bank.js';
import { otherOf, outcomeFor, playerOf, type GameState, type PlayerState } from './machine.js';

/** Карточка игрока по id; нет данных - нейтральная заглушка (имя покажется инициалом «?»). */
export type ProfileLookup = (userId: number) => PlayerProfile | undefined;

const UNKNOWN: PlayerProfile = { name: '', username: null, photoUrl: null, rating: 1000 };

const playerView = (state: GameState, p: PlayerState, profileOf: ProfileLookup): PlayerView => ({
  ...(profileOf(p.userId) ?? UNKNOWN),
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
});

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
  const outcome = outcomeFor(state, viewerId);

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
            text: source[lang].text,
            options: gq.order.map((o) => source[lang].options[o]!),
            startedAt: state.questionStartedAt!,
            endsAt: state.questionStartedAt! + TIMINGS.questionMs,
          }
        : null,
    myAnswer: myCurrent ? { position: myCurrent.position } : null,
    opponentAnswered: state.phase === 'question' && Boolean(opp?.answers[i]),
    reveal,
    result:
      state.finish && outcome
        ? { reason: state.finish.reason, outcome, technical: state.finish.reason !== 'completed' }
        : null,
    cancelReason: state.cancelReason,
  };
}
