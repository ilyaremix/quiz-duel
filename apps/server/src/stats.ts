/**
 * Чтение статистики для экранов после партии: профиль, история матчей, лидерборд,
 * профиль соперника и разбор партии. Только чтение - всё пишется в repo.settle.
 */
import {
  CATEGORIES,
  LEADERBOARD_MIN_GAMES,
  LEADERBOARD_SIZE,
  resolveLang,
  type Category,
  type CategoryStatView,
  type HeadToHead,
  type LeaderboardResponse,
  type MatchSummary,
  type Outcome,
  type PlayerBrief,
  type PlayerResponse,
  type PlayerStats,
  type ProfileResponse,
  type ReviewQuestion,
  type ReviewResponse,
  type ReviewSide,
} from '@quiz-duel/shared';
import type { PrismaClient } from './generated/prisma/client.js';
import { participants, type GameState, type PlayerState } from './game/machine.js';

export interface StatsRepo {
  profile(userId: number): Promise<ProfileResponse | null>;
  leaderboard(userId: number): Promise<LeaderboardResponse>;
  /** null - такого игрока нет или вы с ним ещё ни разу не играли. */
  player(viewerId: number, targetId: number): Promise<PlayerResponse | null>;
  /** null - партии нет, она не завершена или вы в ней не участвовали. */
  review(viewerId: number, gameId: string): Promise<ReviewResponse | null>;
}

/** Колонки игрока, нужные для его цифр. */
interface UserRow {
  id: bigint;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  questionsPlayed: number;
  duelCorrect: number;
  correctTimeMs: bigint;
}

const USER_SELECT = {
  id: true,
  firstName: true,
  username: true,
  photoUrl: true,
  rating: true,
  games: true,
  wins: true,
  losses: true,
  draws: true,
  currentStreak: true,
  bestStreak: true,
  questionsPlayed: true,
  duelCorrect: true,
  correctTimeMs: true,
} as const;

const brief = (u: Pick<UserRow, 'id' | 'firstName' | 'username' | 'photoUrl' | 'rating'>): PlayerBrief => ({
  id: Number(u.id),
  name: u.firstName,
  username: u.username,
  photoUrl: u.photoUrl,
  rating: u.rating,
});

function statsOf(u: UserRow, place: number | null): PlayerStats {
  return {
    rating: u.rating,
    place,
    games: u.games,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    currentStreak: u.currentStreak,
    bestStreak: u.bestStreak,
    questionsPlayed: u.questionsPlayed,
    correct: u.duelCorrect,
    avgCorrectMs: u.duelCorrect > 0 ? Math.round(Number(u.correctTimeMs) / u.duelCorrect) : null,
  };
}

const outcomeOf = (winnerId: bigint | null, me: bigint): Outcome => (winnerId === null ? 'draw' : winnerId === me ? 'win' : 'loss');

export function createPrismaStatsRepo(prisma: PrismaClient): StatsRepo {
  /**
   * Место в лидерборде: порядок - рейтинг, потом число партий, потом кто раньше пришёл (id).
   * У игроков с одинаковым рейтингом места разные, зато список и «моё место» всегда совпадают.
   */
  async function placeOf(u: Pick<UserRow, 'id' | 'rating' | 'games'>): Promise<number | null> {
    if (u.games < LEADERBOARD_MIN_GAMES) return null;
    const ahead = await prisma.user.count({
      where: {
        games: { gte: LEADERBOARD_MIN_GAMES },
        OR: [
          { rating: { gt: u.rating } },
          { rating: u.rating, games: { gt: u.games } },
          { rating: u.rating, games: u.games, id: { lt: u.id } },
        ],
      },
    });
    return ahead + 1;
  }

  async function matchesOf(userId: number, take: number): Promise<MatchSummary[]> {
    const me = BigInt(userId);
    const rows = await prisma.game.findMany({
      where: { phase: 'finished', mode: { not: 'solo' }, opponentId: { not: null }, OR: [{ creatorId: me }, { opponentId: me }] },
      orderBy: { finishedAt: 'desc' },
      take,
      select: {
        id: true,
        mode: true,
        category: true,
        creatorId: true,
        creatorScore: true,
        opponentScore: true,
        winnerId: true,
        finishReason: true,
        creatorRatingDelta: true,
        opponentRatingDelta: true,
        finishedAt: true,
        creator: { select: { id: true, firstName: true, username: true, photoUrl: true, rating: true } },
        opponent: { select: { id: true, firstName: true, username: true, photoUrl: true, rating: true } },
      },
    });
    return rows.map((g) => {
      const iAmCreator = g.creatorId === me;
      const opp = iAmCreator ? g.opponent! : g.creator;
      return {
        gameId: g.id,
        mode: g.mode,
        category: g.category,
        opponent: brief(opp),
        myScore: iAmCreator ? g.creatorScore : g.opponentScore,
        oppScore: iAmCreator ? g.opponentScore : g.creatorScore,
        outcome: outcomeOf(g.winnerId, me),
        technical: g.finishReason !== null && g.finishReason !== 'completed',
        ratingDelta: iAmCreator ? g.creatorRatingDelta : g.opponentRatingDelta,
        finishedAt: (g.finishedAt ?? new Date(0)).getTime(),
      };
    });
  }

  async function headToHead(a: number, b: number): Promise<HeadToHead> {
    const A = BigInt(a);
    const B = BigInt(b);
    const rows = await prisma.game.findMany({
      where: {
        phase: 'finished',
        mode: { not: 'solo' },
        OR: [
          { creatorId: A, opponentId: B },
          { creatorId: B, opponentId: A },
        ],
      },
      select: { winnerId: true, finishedAt: true },
      orderBy: { finishedAt: 'desc' },
    });
    return {
      me: rows.filter((r) => r.winnerId === A).length,
      opp: rows.filter((r) => r.winnerId === B).length,
      draws: rows.filter((r) => r.winnerId === null).length,
      games: rows.length,
      lastAt: rows[0]?.finishedAt?.getTime() ?? null,
    };
  }

  return {
    async profile(userId) {
      const u = await prisma.user.findUnique({ where: { id: BigInt(userId) }, select: USER_SELECT });
      if (!u) return null;
      const [place, cats, matches, achievements] = await Promise.all([
        placeOf(u),
        prisma.categoryStat.findMany({ where: { userId: u.id } }),
        matchesOf(userId, 20),
        prisma.userAchievement.count({ where: { userId: u.id } }),
      ]);
      const categories: CategoryStatView[] = CATEGORIES.map((category: Category) => {
        const c = cats.find((row) => row.category === category);
        return { category, answered: c?.answered ?? 0, correct: c?.correct ?? 0, wins: c?.wins ?? 0 };
      });
      return { me: brief(u), stats: statsOf(u, place), categories, matches, achievements };
    },

    async leaderboard(userId) {
      const [top, me] = await Promise.all([
        prisma.user.findMany({
          where: { games: { gte: LEADERBOARD_MIN_GAMES } },
          orderBy: [{ rating: 'desc' }, { games: 'desc' }, { id: 'asc' }],
          take: LEADERBOARD_SIZE,
          select: { id: true, firstName: true, username: true, photoUrl: true, rating: true, games: true },
        }),
        prisma.user.findUnique({ where: { id: BigInt(userId) }, select: { id: true, rating: true, games: true } }),
      ]);
      const mine = me ?? { id: BigInt(userId), rating: 1000, games: 0 };
      return {
        top: top.map((u, i) => ({ place: i + 1, player: brief(u), games: u.games })),
        me: {
          place: await placeOf(mine),
          rating: mine.rating,
          games: mine.games,
          gamesToQualify: Math.max(0, LEADERBOARD_MIN_GAMES - mine.games),
        },
      };
    },

    async player(viewerId, targetId) {
      if (viewerId === targetId) return null;
      const V = BigInt(viewerId);
      const T = BigInt(targetId);
      // Чужой профиль - только того, с кем уже встречались (в том числе в лобби):
      // перебирать профили всех игроков по id нельзя.
      const met = await prisma.game.findFirst({
        where: {
          OR: [
            { creatorId: V, opponentId: T },
            { creatorId: T, opponentId: V },
          ],
        },
        select: { id: true },
      });
      if (!met) return null;
      const u = await prisma.user.findUnique({ where: { id: T }, select: USER_SELECT });
      if (!u) return null;
      const [place, h2h] = await Promise.all([placeOf(u), headToHead(viewerId, targetId)]);
      return { player: brief(u), stats: statsOf(u, place), headToHead: h2h };
    },

    async review(viewerId, gameId) {
      const row = await prisma.game.findUnique({ where: { id: gameId }, select: { snapshot: true, phase: true } });
      if (!row || row.phase !== 'finished') return null;
      const state = row.snapshot as unknown as GameState;
      if (!state || state.id !== gameId || !state.opponent || !state.finish) return null;
      const me = participants(state).find((p) => p.userId === viewerId);
      const opp = participants(state).find((p) => p.userId !== viewerId);
      if (!me || !opp) return null;

      const [users, questions] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: [BigInt(me.userId), BigInt(opp.userId)] } },
          select: { id: true, firstName: true, username: true, photoUrl: true, rating: true, language: true, tgLanguage: true },
        }),
        // Вопросы из таблицы, а не из файла: разбор старой партии не ломается, если файл потом изменили.
        prisma.question.findMany({ where: { id: { in: state.questions.map((q) => q.id) } } }),
      ]);
      const meRow = users.find((u) => Number(u.id) === me.userId);
      const oppRow = users.find((u) => Number(u.id) === opp.userId);
      if (!meRow || !oppRow) return null;
      const lang = resolveLang(meRow.language, meRow.tgLanguage);

      const side = (p: PlayerState, i: number): ReviewSide => {
        const a = p.answers[i] ?? null;
        return { position: a?.position ?? null, correct: Boolean(a?.correct), timeMs: a?.timeMs ?? null, points: a?.points ?? 0 };
      };
      const list: ReviewQuestion[] = [];
      for (let i = 0; i < state.closed; i++) {
        const gq = state.questions[i];
        const q = gq && questions.find((row) => row.id === gq.id);
        if (!gq || !q) continue;
        const options = lang === 'ru' ? q.optionsRu : q.optionsEn;
        list.push({
          index: i,
          category: q.category,
          text: lang === 'ru' ? q.textRu : q.textEn,
          options: gq.order.map((o) => options[o] ?? ''),
          correctPosition: gq.order.indexOf(q.correctIndex),
          me: side(me, i),
          opp: side(opp, i),
        });
      }
      const winner = state.finish.winnerId;
      return {
        gameId,
        category: state.category,
        outcome: winner === null ? 'draw' : winner === me.userId ? 'win' : 'loss',
        technical: state.finish.reason !== 'completed',
        myScore: me.score,
        oppScore: opp.score,
        me: brief(meRow),
        opponent: brief(oppRow),
        questions: list,
      };
    },
  };
}
