import { TIMINGS, type GameView, type Lang, type PlayerView, type RevealSide } from '@quiz-duel/shared';
import type { QuestionBank } from '../questions/bank.js';
import { otherOf, outcomeFor, playerOf, type GameState, type PlayerState } from './machine.js';

const playerView = (p: PlayerState): PlayerView => ({
  userId: p.userId,
  ready: p.ready,
  online: p.online,
  graceEndsAt: p.graceEndsAt,
  score: p.score,
});

/**
 * Снимок партии для одного игрока на его языке. Верный вариант и чужой выбор
 * появляются только в фазе раскрытия, когда вопрос уже закрыт. null - не участник.
 */
export function viewFor(state: GameState, viewerId: number, lang: Lang, bank: QuestionBank, now: number): GameView | null {
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
    me: playerView(me),
    opponent: opp ? playerView(opp) : null,
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
