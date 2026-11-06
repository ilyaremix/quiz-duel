import { FINAL_PHASES, type GamePhase } from '@quiz-duel/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { GameState, PlayerAnswer } from './machine.js';

/**
 * Хранилище партий. Менеджер держит активные партии в памяти и после каждого
 * изменения пишет сюда полный снимок - из него партия поднимается после перезапуска.
 */
export interface GamesRepo {
  /** Создаёт или обновляет строку партии. startedAt передаётся, когда начался отсчёт. */
  save(state: GameState, meta?: { startedAt?: number }): Promise<void>;
  /** Ответ игрока; повтор того же вопроса отклоняет уникальный индекс. */
  saveAnswer(gameId: string, userId: number, questionIndex: number, questionId: string, answer: PlayerAnswer): Promise<void>;
  load(id: string): Promise<GameState | null>;
  /** Все незавершённые партии - для восстановления после перезапуска. */
  loadUnfinished(): Promise<GameState[]>;
  /** Какие вопросы и когда видел кто-то из игроков (id вопроса → мс), по последним партиям. */
  seenQuestions(userIds: readonly number[]): Promise<Map<string, number>>;
}

/** Сколько последних партий игроков учитывать, чтобы не повторять вопросы. */
const SEEN_GAMES = 40;

const asDate = (ms: number | null) => (ms === null ? null : new Date(ms));
const big = (id: number | null) => (id === null ? null : BigInt(id));

function columns(state: GameState) {
  const finishedAt = state.finish?.at ?? null;
  return {
    mode: state.mode,
    phase: state.phase,
    finishReason: state.finish?.reason ?? null,
    cancelReason: state.cancelReason,
    category: state.category,
    creatorId: BigInt(state.creator.userId),
    opponentId: big(state.opponent?.userId ?? null),
    questionIds: state.questions.map((q) => q.id),
    optionOrders: state.questions.map((q) => q.order),
    questionIndex: state.questionIndex,
    phaseEndsAt: asDate(state.phaseEndsAt),
    lobbyExpiresAt: asDate(state.lobbyExpiresAt),
    creatorScore: state.creator.score,
    opponentScore: state.opponent?.score ?? 0,
    winnerId: big(state.finish?.winnerId ?? null),
    rematchOf: state.rematchOf,
    rev: state.rev,
    snapshot: state as unknown as Prisma.InputJsonValue,
    finishedAt: asDate(finishedAt),
  };
}

function fromSnapshot(value: unknown, id: string): GameState | null {
  if (!value || typeof value !== 'object' || (value as GameState).id !== id) return null;
  return value as GameState;
}

export function createPrismaGamesRepo(prisma: PrismaClient): GamesRepo {
  return {
    async save(state, meta) {
      const data = columns(state);
      const startedAt = meta?.startedAt === undefined ? undefined : new Date(meta.startedAt);
      await prisma.game.upsert({
        where: { id: state.id },
        create: { id: state.id, ...data, createdAt: new Date(state.createdAt), startedAt: startedAt ?? null },
        update: { ...data, ...(startedAt ? { startedAt } : {}) },
      });
    },

    async saveAnswer(gameId, userId, questionIndex, questionId, answer) {
      await prisma.answer.create({
        data: {
          gameId,
          userId: BigInt(userId),
          questionIndex,
          questionId,
          optionIndex: answer.option,
          position: answer.position,
          isCorrect: answer.correct,
          timeMs: answer.timeMs,
          points: answer.points,
        },
      });
    },

    async load(id) {
      const row = await prisma.game.findUnique({ where: { id }, select: { snapshot: true } });
      return row ? fromSnapshot(row.snapshot, id) : null;
    },

    async loadUnfinished() {
      const rows = await prisma.game.findMany({
        where: { phase: { notIn: FINAL_PHASES as GamePhase[] } },
        select: { id: true, snapshot: true },
      });
      return rows.map((r) => fromSnapshot(r.snapshot, r.id)).filter((s): s is GameState => s !== null);
    },

    async seenQuestions(userIds) {
      const ids = userIds.map((id) => BigInt(id));
      const rows = await prisma.game.findMany({
        where: {
          OR: [{ creatorId: { in: ids } }, { opponentId: { in: ids } }],
          startedAt: { not: null },
        },
        orderBy: { startedAt: 'desc' },
        take: SEEN_GAMES,
        select: { questionIds: true, startedAt: true },
      });
      const seen = new Map<string, number>();
      for (const row of rows) {
        const at = row.startedAt!.getTime();
        for (const q of row.questionIds) seen.set(q, Math.max(seen.get(q) ?? 0, at));
      }
      return seen;
    },
  };
}

/** Хранилище в памяти - для тестов и локальной вёрстки. */
export function memoryGamesRepo(): GamesRepo & { rows: Map<string, { state: GameState; startedAt: number | null }>; answers: string[] } {
  const rows = new Map<string, { state: GameState; startedAt: number | null }>();
  const answers: string[] = [];
  const copy = (s: GameState) => structuredClone(s);
  return {
    rows,
    answers,
    async save(state, meta) {
      const prev = rows.get(state.id);
      rows.set(state.id, { state: copy(state), startedAt: meta?.startedAt ?? prev?.startedAt ?? null });
    },
    async saveAnswer(gameId, userId, questionIndex) {
      const key = `${gameId}/${userId}/${questionIndex}`;
      if (answers.includes(key)) throw new Error('duplicate answer');
      answers.push(key);
    },
    async load(id) {
      const row = rows.get(id);
      return row ? copy(row.state) : null;
    },
    async loadUnfinished() {
      return [...rows.values()].filter((r) => !FINAL_PHASES.includes(r.state.phase)).map((r) => copy(r.state));
    },
    async seenQuestions(userIds) {
      const seen = new Map<string, number>();
      for (const { state, startedAt } of rows.values()) {
        if (startedAt === null) continue;
        const players = [state.creator.userId, state.opponent?.userId];
        if (!players.some((p) => p !== undefined && userIds.includes(p))) continue;
        for (const q of state.questions) seen.set(q.id, Math.max(seen.get(q.id) ?? 0, startedAt));
      }
      return seen;
    },
  };
}
