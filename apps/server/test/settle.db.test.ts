/**
 * Итоги партии на настоящем Postgres: одна транзакция, повтор ничего не меняет,
 * две партии одного игрока одновременно не теряют изменений, сбой откатывает всё.
 * И чтение для экранов: профиль, лидерборд, профиль соперника, разбор.
 *
 * Нужен TEST_DATABASE_URL (в CI - сервис postgres). Без него файл пропускается.
 * Внимание: тест очищает таблицы этой базы.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TIMINGS, type GameCategory } from '@quiz-duel/shared';
import { createPrisma } from '../src/db.js';
import { createPrismaGamesRepo } from '../src/game/repo.js';
import * as machine from '../src/game/machine.js';
import type { GameState, MachineDeps } from '../src/game/machine.js';
import { pickQuestions } from '../src/game/picker.js';
import { settleInput } from '../src/game/settle.js';
import { loadQuestionBank } from '../src/questions/bank.js';
import { syncQuestions } from '../src/questions/sync.js';
import { createPrismaStatsRepo } from '../src/stats.js';
import { createPrismaUsersRepo } from '../src/users.js';
import { seededRng } from '../src/game/rng.js';

const url = process.env.TEST_DATABASE_URL;
const bank = loadQuestionBank();
const A = 2001;
const B = 2002;
const C = 2003;
const T0 = Date.parse('2026-11-07T10:00:00Z');

describe.skipIf(!url)('итоги на Postgres', () => {
  const prisma = createPrisma(url ?? 'postgresql://localhost/none');
  const repo = createPrismaGamesRepo(prisma);
  const stats = createPrismaStatsRepo(prisma);
  let seq = 0;

  const deps = (): MachineDeps => ({
    correctOf: (id) => bank.byId.get(id)!.correct,
    pickQuestions: (s) => pickQuestions({ bank, category: s.category, rng: seededRng(++seq) }),
  });

  /**
   * Сыгранная партия через машину состояний: right[i] - верно ли ответил игрок на вопрос i,
   * creator отвечает за 2,5 с, opponent - за 4 с. forfeitAfter - opponent сдаётся после N вопросов.
   */
  function played(id: string, creator: number, opponent: number, right: [boolean[], boolean[]], opts: { category?: GameCategory; forfeitAfter?: number; at?: number } = {}): GameState {
    const d = deps();
    let now = opts.at ?? T0;
    let s = machine.createGame({ id, mode: 'link', category: opts.category ?? 'science', creatorId: creator, opponentId: opponent, startNow: true }, now, d);
    const step = (r: machine.Step) => {
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    };
    now += TIMINGS.countdownMs;
    step(machine.tick(s, now, d));
    for (let i = 0; i < 10; i++) {
      if (opts.forfeitAfter === i) {
        step(machine.forfeit(s, opponent, now));
        return s;
      }
      const q = s.questions[i]!;
      const correct = q.order.indexOf(bank.byId.get(q.id)!.correct);
      const pos = (ok: boolean | undefined) => (ok ? correct : (correct + 1) % 4);
      step(machine.answer(s, creator, i, pos(right[0][i]), now + 2_500, d));
      step(machine.answer(s, opponent, i, pos(right[1][i]), now + 4_000, d));
      now += 4_000 + TIMINGS.revealMs;
      step(machine.tick(s, now, d));
    }
    return s;
  }
  const n = (k: number) => Array.from({ length: 10 }, (_, i) => i < k);

  async function finish(state: GameState) {
    await repo.save({ ...state, phase: 'reveal', finish: null }); // строка партии была до конца
    return repo.settle(state, settleInput(state, bank), state.finish!.at);
  }

  beforeAll(async () => {
    await syncQuestions(prisma, bank.all);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE answers, user_achievements, category_stats, consents, games, users CASCADE');
    for (const [id, name] of [[A, 'Илья'], [B, 'Марк'], [C, 'Аня']] as const) {
      await prisma.user.create({ data: { id: BigInt(id), firstName: name, tgLanguage: id === B ? 'en' : 'ru' } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const user = (id: number) => prisma.user.findUniqueOrThrow({ where: { id: BigInt(id) } });

  it('одна транзакция: рейтинг, статистика, category_stats, ачивки и финальный снимок', async () => {
    const s = played('SettleAAA1', A, B, [n(7), n(4)]);
    const settlement = await finish(s);
    expect(settlement.players.find((p) => p.userId === A)).toMatchObject({ before: 1000, delta: 20, after: 1020 });

    expect(await user(A)).toMatchObject({ rating: 1020, games: 1, wins: 1, currentStreak: 1, bestStreak: 1, questionsPlayed: 10, duelCorrect: 7, totalCorrect: 7, correctTimeMs: 7n * 2_500n });
    expect(await user(B)).toMatchObject({ rating: 980, games: 1, losses: 1, duelCorrect: 4 });
    const cats = await prisma.categoryStat.findMany({ orderBy: { userId: 'asc' } });
    expect(cats.map((c) => [Number(c.userId), c.category, c.answered, c.correct, c.wins])).toEqual([
      [A, 'science', 10, 7, 1],
      [B, 'science', 10, 4, 0],
    ]);
    const ach = await prisma.userAchievement.findMany({ where: { userId: BigInt(A) } });
    expect(ach.map((a) => a.code)).toEqual(['first_blood']);
    const game = await prisma.game.findUniqueOrThrow({ where: { id: s.id } });
    expect(game).toMatchObject({ phase: 'finished', creatorRatingBefore: 1000, creatorRatingDelta: 20, opponentRatingBefore: 1000, opponentRatingDelta: -20, winnerId: BigInt(A) });
    expect(game.settledAt).not.toBeNull();
    expect((game.snapshot as unknown as GameState).settlement?.players).toHaveLength(2);
  });

  it('повтор (после перезапуска, одновременный) ничего не меняет и возвращает то же', async () => {
    const s = played('SettleAAA2', A, B, [n(7), n(4)]);
    const first = await finish(s);
    const [x, y] = await Promise.all([repo.settle(s, settleInput(s, bank), T0 + 1), repo.settle(s, settleInput(s, bank), T0 + 2)]);
    expect(x).toEqual(first);
    expect(y).toEqual(first);
    expect(await user(A)).toMatchObject({ rating: 1020, games: 1, wins: 1 });
    expect(await prisma.categoryStat.findFirst({ where: { userId: BigInt(A) } })).toMatchObject({ answered: 10 });
    expect(await repo.loadUnsettled()).toEqual([]);
  });

  it('две партии одного игрока заканчиваются одновременно - обе учтены, без дедлока', async () => {
    const ab = played('SettleAB01', A, B, [n(7), n(4)]);
    const ca = played('SettleCA01', C, A, [n(3), n(6)]);
    await repo.save({ ...ab, phase: 'reveal', finish: null });
    await repo.save({ ...ca, phase: 'reveal', finish: null });
    await Promise.all([repo.settle(ab, settleInput(ab, bank), T0), repo.settle(ca, settleInput(ca, bank), T0)]);
    const a = await user(A);
    // Обе победы, рейтинг сложился из двух изменений (+20, потом +K×(1-E) от нового рейтинга).
    expect(a).toMatchObject({ games: 2, wins: 2, currentStreak: 2, duelCorrect: 13, questionsPlayed: 20 });
    expect(a.rating).toBeGreaterThan(1020 + 15);
    expect(await prisma.categoryStat.findFirst({ where: { userId: BigInt(A) } })).toMatchObject({ answered: 20, correct: 13, wins: 2 });
  });

  it('сбой посреди транзакции откатывает всё', async () => {
    const s = played('SettleFAIL', A, B, [n(7), n(4)]);
    await repo.save({ ...s, phase: 'reveal', finish: null });
    // Соперника нет в базе - подсчёт падает уже после чтения первого игрока.
    await prisma.user.delete({ where: { id: BigInt(B) } });
    await expect(repo.settle(s, settleInput(s, bank), T0)).rejects.toThrow();
    expect(await user(A)).toMatchObject({ rating: 1000, games: 0 });
    expect(await prisma.categoryStat.count()).toBe(0);
    expect((await prisma.game.findUniqueOrThrow({ where: { id: s.id } })).settledAt).toBeNull();
  });

  it('недосчитанная завершённая партия находится для досчёта при старте', async () => {
    const s = played('SettleLOST', A, B, [n(7), n(4)]);
    await repo.save(s);
    expect((await repo.loadUnsettled()).map((g) => g.id)).toEqual([s.id]);
    await repo.settle(s, settleInput(s, bank), T0);
    expect(await repo.loadUnsettled()).toEqual([]);
  });

  it('техническое поражение в базе - обычное поражение', async () => {
    const s = played('SettleTECH', A, B, [n(10), n(10)], { forfeitAfter: 3 });
    await finish(s);
    expect(await user(B)).toMatchObject({ rating: 980, losses: 1, questionsPlayed: 3 });
    expect(await user(A)).toMatchObject({ rating: 1020, wins: 1, questionsPlayed: 3, duelCorrect: 3 });
    expect(await prisma.userAchievement.count()).toBe(0);
  });

  it('тренировка: строка solo_runs, «Эрудит» и итог одной транзакцией; повтор ничего не добавляет', async () => {
    const d = deps();
    await prisma.user.update({ where: { id: BigInt(A) }, data: { totalCorrect: 95, rating: 1111 } });
    let now = T0;
    let s = machine.createGame({ id: 'SoloGame01', mode: 'solo', category: 'tech', creatorId: A, soloBest: null }, now, d);
    for (let i = 0; i < 10; i++) {
      const q = s.questions[i]!;
      const r = machine.answer(s, A, i, q.order.indexOf(bank.byId.get(q.id)!.correct), now + 2_000, d);
      if (!r.ok) throw new Error(r.error);
      now += 2_000 + TIMINGS.revealMs;
      const t = machine.tick(r.state, now, d);
      if (!t.ok) throw new Error(t.error);
      s = t.state;
    }
    expect(s.phase).toBe('finished');
    await repo.save({ ...s, phase: 'reveal', finish: null });
    const first = await repo.settleSolo(s, now);
    expect(first.solo).toEqual({ score: s.creator.score, prevBest: null, record: true });
    expect(first.players[0]!.achievements).toEqual(['erudite']);
    const again = await repo.settleSolo(s, now + 5_000);
    expect(again).toEqual(first);
    expect(await prisma.soloRun.count()).toBe(1);
    // Рейтинг и дуэльная статистика не тронуты; верные ответы - в «Эрудита».
    expect(await user(A)).toMatchObject({ rating: 1111, games: 0, totalCorrect: 105, duelCorrect: 0 });
    expect(await repo.soloBest(A, 'tech')).toBe(s.creator.score);
    expect(await repo.soloBest(A, 'sport')).toBeNull();
    expect((await prisma.game.findUniqueOrThrow({ where: { id: 'SoloGame01' } })).settledAt).not.toBeNull();
    // В историю матчей и разбор тренировка не попадает.
    expect((await stats.profile(A))?.matches).toEqual([]);
  });

  it('уникальный индекс answers - вторая линия защиты: второй ответ того же игрока на тот же вопрос база не примет', async () => {
    const s = played('UniqAnsw01', A, B, [n(10), n(0)]);
    await repo.save(s);
    const q = s.questions[0]!;
    const first = s.creator.answers[0]!;
    await repo.saveAnswer(s.id, A, 0, q.id, first);
    await expect(repo.saveAnswer(s.id, A, 0, q.id, { ...first, position: (first.position + 1) % 4, correct: false, points: 0 })).rejects.toThrow();
    const rows = await prisma.answer.findMany({ where: { gameId: s.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: BigInt(A), questionIndex: 0, isCorrect: true, points: first.points });
    // У соперника на тот же вопрос - своя строка.
    await repo.saveAnswer(s.id, B, 0, q.id, s.opponent!.answers[0]!);
    expect(await prisma.answer.count({ where: { gameId: s.id } })).toBe(2);
  });

  it('журнал согласий: новая версия документов - новые строки, старые остаются; повтор - ещё строки', async () => {
    const users = createPrismaUsersRepo(prisma);
    const input = { userId: A, docs: ['terms', 'privacy'] as ('terms' | 'privacy')[], ip: '203.0.113.7', userAgent: 'Telegram-Android/11.2' };
    await users.acceptDocs({ ...input, version: '2026-11-07' });
    await users.acceptDocs({ ...input, version: '2026-12-01' });
    await users.acceptDocs({ ...input, version: '2026-12-01' });
    const rows = await prisma.consent.findMany({ where: { userId: BigInt(A) }, orderBy: { id: 'asc' } });
    expect(rows.map((r) => `${r.doc}@${r.docVersion}`)).toEqual([
      'terms@2026-11-07', 'privacy@2026-11-07', 'terms@2026-12-01', 'privacy@2026-12-01', 'terms@2026-12-01', 'privacy@2026-12-01',
    ]);
    expect(rows[0]).toMatchObject({ ip: '203.0.113.7', userAgent: 'Telegram-Android/11.2' });
    expect((await user(A)).docsVersion).toBe('2026-12-01');
  });

  describe('чтение для экранов', () => {
    it('профиль: цифры, точность, среднее время верного, категории и история', async () => {
      await finish(played('ReadGame01', A, B, [n(7), n(4)], { at: T0 }));
      await finish(played('ReadGame02', B, A, [n(6), n(5)], { at: T0 + 3_600_000, category: 'history' }));
      const p = await stats.profile(A);
      expect(p?.stats).toMatchObject({ games: 2, wins: 1, losses: 1, questionsPlayed: 20, correct: 12, place: null });
      // Создатель отвечает за 2,5 с, соперник - за 4 с.
      expect(p?.stats.avgCorrectMs).toBe(Math.round((7 * 2_500 + 5 * 4_000) / 12));
      expect(p?.categories.find((c) => c.category === 'history')).toMatchObject({ answered: 10, correct: 5, wins: 0 });
      expect(p?.matches.map((m) => [m.gameId, m.outcome, m.myScore > m.oppScore])).toEqual([
        ['ReadGame02', 'loss', false],
        ['ReadGame01', 'win', true],
      ]);
      expect(p?.matches[0]).toMatchObject({ opponent: { id: B, name: 'Марк' }, category: 'history' });
      expect(p?.matches[0]?.ratingDelta).toBeLessThan(0);
    });

    it('лидерборд: только игроки с 5+ партиями, моё место и сколько осталось до рейтинга', async () => {
      await prisma.user.update({ where: { id: BigInt(A) }, data: { games: 5, rating: 1100 } });
      await prisma.user.update({ where: { id: BigInt(B) }, data: { games: 12, rating: 1150 } });
      await prisma.user.update({ where: { id: BigInt(C) }, data: { games: 4, rating: 1500 } });
      const board = await stats.leaderboard(A);
      expect(board.top.map((r) => [r.place, r.player.id])).toEqual([
        [1, B],
        [2, A],
      ]);
      expect(board.me).toMatchObject({ place: 2, rating: 1100, gamesToQualify: 0 });
      expect((await stats.leaderboard(C)).me).toMatchObject({ place: null, gamesToQualify: 1 });
    });

    it('профиль соперника и личный счёт - только того, с кем играли', async () => {
      await finish(played('H2Hgame001', A, B, [n(7), n(4)], { at: T0 }));
      await finish(played('H2Hgame002', A, B, [n(8), n(2)], { at: T0 + 1_000_000 }));
      await finish(played('H2Hgame003', B, A, [n(0), n(0)], { at: T0 + 2_000_000 }));
      const r = await stats.player(A, B);
      expect(r?.headToHead).toMatchObject({ me: 2, opp: 0, draws: 1, games: 3 });
      expect(r?.player).toMatchObject({ id: B, name: 'Марк' });
      expect(await stats.player(A, C)).toBeNull();
      expect(await stats.player(A, A)).toBeNull();
    });

    it('ачивки: полученные с датой и прогресс закрытых по тем же цифрам, что и выдача', async () => {
      await finish(played('AchGame001', A, B, [n(10), n(4)], { at: T0 }));
      const list = await stats.achievements(A);
      expect(list).toMatchObject({ total: 12 });
      const by = (code: string) => list!.items.find((i) => i.code === code)!;
      // 10 из 10 верных и первая победа - получены в этой партии, с датой подсчёта.
      expect(by('first_blood')).toMatchObject({ unlocked: true, unlockedAt: expect.any(Number), current: 1, goal: 1 });
      expect(by('perfect_game')).toMatchObject({ unlocked: true });
      // Закрытые - с прогрессом: 10 верных из 100, 1 партия из 50, серия 1 из 3.
      expect(by('erudite')).toMatchObject({ unlocked: false, unlockedAt: null, current: 10, goal: 100 });
      expect(by('veteran')).toMatchObject({ unlocked: false, current: 1, goal: 50 });
      expect(by('on_a_roll')).toMatchObject({ unlocked: false, current: 1, goal: 3 });
      expect(list!.unlocked).toBe(list!.items.filter((i) => i.unlocked).length);
      expect(list!.items.map((i) => i.code)[0]).toBe('first_blood');
      // У Марка (поражение) - ничего, кроме прогресса.
      expect((await stats.achievements(B))!.unlocked).toBe(0);
      expect(await stats.achievements(999_999)).toBeNull();
    });

    it('разбор: вопросы на языке игрока, верный вариант, ответы и время обоих; только участникам', async () => {
      const s = played('ReviewG001', A, B, [n(7), n(4)]);
      await finish(s);
      const mine = await stats.review(A, s.id);
      expect(mine?.questions).toHaveLength(10);
      const q0 = mine!.questions[0]!;
      const src = bank.byId.get(s.questions[0]!.id)!;
      expect(q0.text).toBe(src.ru.text);
      expect(q0.options[q0.correctPosition]).toBe(src.ru.options[src.correct]);
      expect(q0.me).toEqual({ position: q0.correctPosition, correct: true, timeMs: 2_500, points: pointsAt(2_500) });
      expect(mine?.questions[9]?.opp.correct).toBe(false);
      // Марк видит тот же разбор по-английски.
      expect((await stats.review(B, s.id))?.questions[0]?.text).toBe(src.en.text);
      expect(await stats.review(C, s.id)).toBeNull();
    });
  });
});

function pointsAt(ms: number) {
  return Math.round(500 + (500 * (15_000 - ms)) / 15_000);
}
