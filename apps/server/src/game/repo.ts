import {
  applySolo,
  CATEGORIES,
  ELO,
  EMPTY_TOTALS,
  newAchievements,
  type AchievementCode,
  type Category,
  type GameCategory,
  type GamePhase,
} from '@quiz-duel/shared';
import { FINAL_PHASES } from '@quiz-duel/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { changesRating, rulesOf, withSettlement, type GameState, type PlayerAnswer, type Settlement } from './machine.js';
import { computeSettlement, toSettlement, type CategoryCounters, type PlayerUpdate, type SettleInput, type StoredPlayer } from './settle.js';

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
  /**
   * Итоги рейтинговой дуэли одной транзакцией: финальный снимок партии, рейтинг Эло,
   * статистика игроков, category_stats и ачивки. Повторный вызов для той же партии
   * ничего не меняет и возвращает уже посчитанное (после перезапуска, при гонке).
   */
  settle(state: GameState, input: SettleInput, now: number): Promise<Settlement>;
  /** Завершённые рейтинговые партии и тренировки, итоги которых ещё не посчитаны (сервер упал между ними). */
  loadUnsettled(): Promise<GameState[]>;
  /** Личный рекорд тренировки в категории; null - тренировок в ней ещё не было. */
  soloBest(userId: number, category: GameCategory): Promise<number | null>;
  /**
   * Итог тренировки одной транзакцией: строка solo_runs (рекорд), верные ответы в «Эрудита»,
   * ачивка «Эрудит», финальный снимок. Рейтинг и статистика дуэлей не меняются.
   * Повторный вызов ничего не меняет и возвращает уже посчитанное.
   */
  settleSolo(state: GameState, now: number): Promise<Settlement>;
}

/** Счёт и верные ответы тренировки (только закрытые вопросы). */
export function soloScore(state: GameState) {
  const me = state.creator;
  let correct = 0;
  for (let i = 0; i < state.closed; i++) if (me.answers[i]?.correct) correct += 1;
  return { score: me.score, correct };
}

/** Итог тренировки из прошлого рекорда и цифр игрока. Чистая функция - её же использует хранилище в памяти. */
export function soloSettlement(
  state: GameState,
  player: { rating: number; totalCorrect: number; unlocked: ReadonlySet<AchievementCode> },
  prevBest: number | null,
  now: number,
): { settlement: Settlement; correct: number; totalCorrect: number } {
  const { score, correct } = soloScore(state);
  const totals = applySolo({ ...EMPTY_TOTALS, rating: player.rating, totalCorrect: player.totalCorrect }, { kind: 'solo', correct });
  const achievements = newAchievements(totals, { kind: 'solo', correct }, player.unlocked);
  // Рекорд - больше прошлого; первая попытка с очками - тоже рекорд.
  const record = score > (prevBest ?? 0);
  return {
    settlement: {
      at: now,
      players: [{ userId: state.creator.userId, before: player.rating, delta: 0, after: player.rating, achievements }],
      solo: { score, prevBest, record },
    },
    correct,
    totalCorrect: totals.totalCorrect,
  };
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
    variant: rulesOf(state).variant,
    timeSec: rulesOf(state).timeSec,
    questionCount: rulesOf(state).count,
    rev: state.rev,
    snapshot: state as unknown as Prisma.InputJsonValue,
    finishedAt: asDate(finishedAt),
  };
}

/** Колонки рейтинга в games: рейтинг до партии и изменение у создателя и соперника. */
function ratingColumns(state: GameState, settlement: Settlement) {
  const of = (id: number | undefined) => settlement.players.find((p) => p.userId === id);
  const c = of(state.creator.userId);
  const o = of(state.opponent?.userId);
  // Режимы, кроме «Классики», рейтинг не меняют: изменения в истории нет вовсе.
  const rated = changesRating(state);
  return {
    creatorRatingBefore: c?.before ?? null,
    creatorRatingDelta: rated ? (c?.delta ?? null) : null,
    opponentRatingBefore: o?.before ?? null,
    opponentRatingDelta: rated ? (o?.delta ?? null) : null,
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

    async settle(state, input, now) {
      const ids = input.players.map((p) => p.userId).sort((a, b) => a - b);
      return prisma.$transaction(async (tx) => {
        // 1. Строка партии под блокировкой: два одновременных подсчёта одной партии идут по очереди,
        //    второй видит settled_at и возвращает готовое.
        const locked = await tx.$queryRaw<{ settled_at: Date | null; snapshot: unknown }[]>`
          SELECT settled_at, snapshot FROM games WHERE id = ${state.id} FOR UPDATE`;
        const done = locked[0];
        if (done?.settled_at) {
          const saved = fromSnapshot(done.snapshot, state.id)?.settlement;
          if (saved) return saved;
        }

        // 2. Оба игрока под блокировкой, всегда в порядке id: если у игрока одновременно
        //    заканчиваются две партии, транзакции не заблокируют друг друга навсегда.
        const rows = await tx.$queryRaw<
          {
            id: bigint;
            rating: number;
            games: number;
            wins: number;
            losses: number;
            draws: number;
            current_streak: number;
            best_streak: number;
            total_correct: number;
            questions_played: number;
            duel_correct: number;
            correct_time_ms: bigint;
          }[]
        >`SELECT id, rating, games, wins, losses, draws, current_streak, best_streak, total_correct,
                 questions_played, duel_correct, correct_time_ms
          FROM users WHERE id IN (${Prisma.join(ids.map((id) => BigInt(id)))})
          ORDER BY id FOR UPDATE`;
        const big = ids.map((id) => BigInt(id));
        const cats = await tx.categoryStat.findMany({ where: { userId: { in: big } } });
        const unlocked = await tx.userAchievement.findMany({ where: { userId: { in: big } }, select: { userId: true, code: true } });

        const stored = ids.map((id): StoredPlayer => {
          const r = rows.find((row) => Number(row.id) === id);
          if (!r) throw new Error(`игрок ${id} не найден`);
          const categories: Partial<Record<Category, CategoryCounters>> = {};
          for (const c of cats) if (Number(c.userId) === id) categories[c.category] = { answered: c.answered, correct: c.correct, wins: c.wins };
          return {
            userId: id,
            rating: r.rating,
            games: r.games,
            wins: r.wins,
            losses: r.losses,
            draws: r.draws,
            currentStreak: r.current_streak,
            bestStreak: r.best_streak,
            totalCorrect: r.total_correct,
            questionsPlayed: r.questions_played,
            duelCorrect: r.duel_correct,
            correctTimeMs: Number(r.correct_time_ms),
            categories,
            unlocked: new Set(unlocked.filter((u) => Number(u.userId) === id).map((u) => u.code as AchievementCode)),
          };
        }) as [StoredPlayer, StoredPlayer];

        // 3. Подсчёт и запись - всё в этой же транзакции.
        const updates = computeSettlement(stored, input);
        for (const u of updates) await writePlayer(tx, u, state.id);

        const settlement = toSettlement(updates, now);
        const final = withSettlement(state, settlement);
        const data = { ...columns(final), ...ratingColumns(final, settlement), settledAt: new Date(now) };
        await tx.game.upsert({
          where: { id: state.id },
          create: { id: state.id, ...data, createdAt: new Date(state.createdAt) },
          update: data,
        });
        return settlement;
      });
    },

    async soloBest(userId, category) {
      const best = await prisma.soloRun.aggregate({ where: { userId: BigInt(userId), category }, _max: { score: true } });
      return best._max.score ?? null;
    },

    async settleSolo(state, now) {
      const userId = state.creator.userId;
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ settled_at: Date | null; snapshot: unknown }[]>`
          SELECT settled_at, snapshot FROM games WHERE id = ${state.id} FOR UPDATE`;
        if (locked[0]?.settled_at) {
          const saved = fromSnapshot(locked[0].snapshot, state.id)?.settlement;
          if (saved) return saved;
        }
        const rows = await tx.$queryRaw<{ rating: number; total_correct: number }[]>`
          SELECT rating, total_correct FROM users WHERE id = ${BigInt(userId)} FOR UPDATE`;
        const u = rows[0];
        if (!u) throw new Error(`игрок ${userId} не найден`);
        const unlocked = await tx.userAchievement.findMany({ where: { userId: BigInt(userId) }, select: { code: true } });
        // Прошлый рекорд - на момент подсчёта (другие тренировки игрока могли закончиться раньше).
        const best = await tx.soloRun.aggregate({ where: { userId: BigInt(userId), category: state.category }, _max: { score: true } });
        const r = soloSettlement(
          state,
          { rating: u.rating, totalCorrect: u.total_correct, unlocked: new Set(unlocked.map((x) => x.code as AchievementCode)) },
          best._max.score ?? null,
          now,
        );
        const final = withSettlement(state, r.settlement);
        const data = { ...columns(final), settledAt: new Date(now) };
        await tx.game.upsert({ where: { id: state.id }, create: { id: state.id, ...data, createdAt: new Date(state.createdAt) }, update: data });
        await tx.soloRun.create({
          data: { gameId: state.id, userId: BigInt(userId), category: state.category, score: r.settlement.solo!.score, correct: r.correct },
        });
        await tx.user.update({ where: { id: BigInt(userId) }, data: { totalCorrect: r.totalCorrect } });
        const codes = r.settlement.players[0]!.achievements;
        if (codes.length > 0) {
          await tx.userAchievement.createMany({ data: codes.map((code) => ({ userId: BigInt(userId), code, gameId: state.id })), skipDuplicates: true });
        }
        return r.settlement;
      });
    },

    async loadUnsettled() {
      const rows = await prisma.game.findMany({
        where: { phase: 'finished', settledAt: null, OR: [{ mode: 'solo' }, { opponentId: { not: null } }] },
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

type Tx = Prisma.TransactionClient;

async function writePlayer(tx: Tx, u: PlayerUpdate, gameId: string) {
  const id = BigInt(u.userId);
  const t = u.totals;
  await tx.user.update({
    where: { id },
    data: {
      rating: t.rating,
      games: t.games,
      wins: t.wins,
      losses: t.losses,
      draws: t.draws,
      currentStreak: t.currentStreak,
      bestStreak: t.bestStreak,
      totalCorrect: t.totalCorrect,
      questionsPlayed: u.questionsPlayed,
      duelCorrect: u.duelCorrect,
      correctTimeMs: BigInt(u.correctTimeMs),
    },
  });
  for (const category of CATEGORIES) {
    const add = u.categoryAdd[category];
    if (!add) continue;
    await tx.categoryStat.upsert({
      where: { userId_category: { userId: id, category } },
      create: { userId: id, category, ...add },
      update: { answered: { increment: add.answered }, correct: { increment: add.correct }, wins: { increment: add.wins } },
    });
  }
  if (u.achievements.length > 0) {
    await tx.userAchievement.createMany({
      data: u.achievements.map((code) => ({ userId: id, code, gameId })),
      skipDuplicates: true,
    });
  }
}

/** Игрок в памяти для тестов: то же, что в users + category_stats + user_achievements. */
export type MemoryPlayer = StoredPlayer & { unlocked: Set<AchievementCode> };

export const memoryPlayer = (userId: number, patch: Partial<StoredPlayer> = {}): MemoryPlayer => ({
  userId,
  rating: ELO.start,
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalCorrect: 0,
  questionsPlayed: 0,
  duelCorrect: 0,
  correctTimeMs: 0,
  categories: {},
  ...patch,
  unlocked: new Set(patch.unlocked ?? []),
});

/** Хранилище в памяти - для тестов и локальной вёрстки. */
export function memoryGamesRepo(): GamesRepo & {
  rows: Map<string, { state: GameState; startedAt: number | null; settledAt?: number | null }>;
  answers: string[];
  players: Map<number, MemoryPlayer>;
  /** Сколько раз подсчёт итогов действительно что-то записал. */
  settledCount: number;
  /** Сломать следующий подсчёт итогов (проверка повтора после сбоя). */
  failNextSettle: boolean;
  /** Тренировки: gameId → строка solo_runs. */
  soloRuns: Map<string, { userId: number; category: GameCategory; score: number; correct: number }>;
} {
  const rows = new Map<string, { state: GameState; startedAt: number | null; settledAt?: number | null }>();
  const answers: string[] = [];
  const players = new Map<number, MemoryPlayer>();
  const soloRuns = new Map<string, { userId: number; category: GameCategory; score: number; correct: number }>();
  const copy = (s: GameState) => structuredClone(s);
  const bestOf = (userId: number, category: GameCategory) => {
    const scores = [...soloRuns.values()].filter((r) => r.userId === userId && r.category === category).map((r) => r.score);
    return scores.length ? Math.max(...scores) : null;
  };
  const repo = {
    rows,
    answers,
    players,
    settledCount: 0,
    failNextSettle: false,
    soloRuns,
    async soloBest(userId: number, category: GameCategory) {
      return bestOf(userId, category);
    },
    async settleSolo(state: GameState, now: number): Promise<Settlement> {
      if (repo.failNextSettle) {
        repo.failNextSettle = false;
        throw new Error('settle failed (test)');
      }
      const prev = rows.get(state.id);
      if (prev?.settledAt && prev.state.settlement) return structuredClone(prev.state.settlement);
      const id = state.creator.userId;
      if (!players.has(id)) players.set(id, memoryPlayer(id));
      const p = players.get(id)!;
      const r = soloSettlement(state, p, bestOf(id, state.category), now);
      soloRuns.set(state.id, { userId: id, category: state.category, score: r.settlement.solo!.score, correct: r.correct });
      p.totalCorrect = r.totalCorrect;
      for (const code of r.settlement.players[0]!.achievements) p.unlocked.add(code);
      rows.set(state.id, { state: copy(withSettlement(state, r.settlement)), startedAt: prev?.startedAt ?? null, settledAt: now });
      repo.settledCount += 1;
      return r.settlement;
    },
    async save(state: GameState, meta?: { startedAt?: number }) {
      const prev = rows.get(state.id);
      rows.set(state.id, { state: copy(state), startedAt: meta?.startedAt ?? prev?.startedAt ?? null, settledAt: prev?.settledAt ?? null });
    },
    async settle(state: GameState, input: SettleInput, now: number): Promise<Settlement> {
      // В памяти всё синхронно - это и есть «транзакция»: либо записано всё, либо ничего.
      if (repo.failNextSettle) {
        repo.failNextSettle = false;
        throw new Error('settle failed (test)');
      }
      const prev = rows.get(state.id);
      if (prev?.settledAt && prev.state.settlement) return structuredClone(prev.state.settlement);
      const ids = input.players.map((p) => p.userId).sort((a, b) => a - b);
      const stored = ids.map((id) => {
        if (!players.has(id)) players.set(id, memoryPlayer(id));
        return players.get(id)!;
      }) as [MemoryPlayer, MemoryPlayer];
      const updates = computeSettlement(stored, input);
      for (const u of updates) {
        const p = players.get(u.userId)!;
        const t = u.totals;
        Object.assign(p, {
          rating: t.rating, games: t.games, wins: t.wins, losses: t.losses, draws: t.draws,
          currentStreak: t.currentStreak, bestStreak: t.bestStreak, totalCorrect: t.totalCorrect,
          questionsPlayed: u.questionsPlayed, duelCorrect: u.duelCorrect, correctTimeMs: u.correctTimeMs,
        });
        for (const [c, add] of Object.entries(u.categoryAdd) as [Category, CategoryCounters][]) {
          const cur = (p.categories[c] ??= { answered: 0, correct: 0, wins: 0 });
          cur.answered += add.answered;
          cur.correct += add.correct;
          cur.wins += add.wins;
        }
        for (const code of u.achievements) p.unlocked.add(code);
      }
      const settlement = toSettlement(updates, now);
      rows.set(state.id, { state: copy(withSettlement(state, settlement)), startedAt: prev?.startedAt ?? null, settledAt: now });
      repo.settledCount += 1;
      return settlement;
    },
    async loadUnsettled() {
      return [...rows.values()]
        .filter((r) => r.state.phase === 'finished' && !r.settledAt && (r.state.mode === 'solo' || r.state.opponent))
        .map((r) => copy(r.state));
    },
    async saveAnswer(gameId: string, userId: number, questionIndex: number) {
      const key = `${gameId}/${userId}/${questionIndex}`;
      if (answers.includes(key)) throw new Error('duplicate answer');
      answers.push(key);
    },
    async load(id: string) {
      const row = rows.get(id);
      return row ? copy(row.state) : null;
    },
    async loadUnfinished() {
      return [...rows.values()].filter((r) => !FINAL_PHASES.includes(r.state.phase)).map((r) => copy(r.state));
    },
    async seenQuestions(userIds: readonly number[]) {
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
  return repo satisfies GamesRepo;
}
