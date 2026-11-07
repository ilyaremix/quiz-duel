/**
 * Этап 7: итоги партии (рейтинг, статистика, ачивки - одной транзакцией) и реванш.
 * Менеджер с хранилищем в памяти и фейковыми таймерами. Та же транзакция на настоящем
 * Postgres - в settle.db.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMINGS, type GameView } from '@quiz-duel/shared';
import { GameManager } from '../src/game/manager.js';
import { memoryGamesRepo, memoryPlayer } from '../src/game/repo.js';
import { loadQuestionBank } from '../src/questions/bank.js';
import type { TelegramUser } from '../src/auth/initData.js';
import { DOCS_VERSION, memoryUsers } from './helpers.js';

const A = 1001;
const B = 1002;
const C = 1003;
const bank = loadQuestionBank();
type Repo = ReturnType<typeof memoryGamesRepo>;
type Push = { userId: number; view: GameView };

const managers: GameManager[] = [];

async function setup(options: { repo?: Repo } = {}) {
  const users = memoryUsers();
  const repo = options.repo ?? memoryGamesRepo();
  const pushes: Push[] = [];
  for (const [id, name] of [
    [A, 'Илья'],
    [B, 'Марк'],
    [C, 'Аня'],
  ] as const) {
    const tg: TelegramUser = { id, first_name: name, language_code: id === B ? 'en' : 'ru' };
    await users.upsertFromTelegram(tg);
    users.rows.get(id)!.docsVersion = DOCS_VERSION;
  }
  let n = 0;
  const errors: unknown[] = [];
  const games = new GameManager({
    repo,
    users,
    bank,
    notify: { state: (userId, view) => pushes.push({ userId, view }) },
    appUrl: 'https://t.me/quiz_test_bot/play',
    docsVersion: DOCS_VERSION,
    log: { error: (o) => errors.push(o), warn: () => {}, info: () => {} },
    newId: () => `Game${String(++n).padStart(6, '0')}`,
  });
  managers.push(games);
  return { games, users, repo, pushes, errors };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
});

afterEach(() => {
  managers.splice(0).forEach((m) => m.stop());
  vi.useRealTimers();
});

const last = (pushes: Push[], userId: number, gameId?: string) => pushes.filter((p) => p.userId === userId && (!gameId || p.view.id === gameId)).at(-1)!.view;

function correctPos(repo: Repo, id: string, index: number) {
  const q = repo.rows.get(id)!.state.questions[index]!;
  return q.order.indexOf(bank.byId.get(q.id)!.correct);
}

/** Лобби → оба «Готов» → отсчёт. */
async function start(games: GameManager, category: 'science' | 'mix' = 'science') {
  await games.connect(A);
  await games.connect(B);
  const created = await games.create(A, category);
  if (!created.ok) throw new Error(created.error);
  const id = created.game.id;
  await games.join(B, id);
  await games.ready(A, id, true);
  await games.ready(B, id, true);
  return id;
}

/** 10 вопросов: A верно на первые aRight, B - на первые bRight; оба отвечают за 1,5 с. */
async function playOut(games: GameManager, repo: Repo, id: string, aRight: number, bRight: number) {
  await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs);
  for (let i = 0; i < 10; i++) {
    const right = correctPos(repo, id, i);
    await vi.advanceTimersByTimeAsync(1_500);
    await games.answer(A, id, i, i < aRight ? right : (right + 1) % 4);
    await games.answer(B, id, i, i < bRight ? right : (right + 1) % 4);
    await vi.advanceTimersByTimeAsync(TIMINGS.revealMs);
  }
}

async function finished(aRight = 7, bRight = 4, base?: Awaited<ReturnType<typeof setup>>) {
  const env = base ?? (await setup());
  const id = await start(env.games);
  await playOut(env.games, env.repo, id, aRight, bRight);
  return { ...env, id };
}

// ---------------------------------------------------------------------------

describe('итоги партии', () => {
  it('рейтинг, статистика и итоги приходят в снимке завершённой партии', async () => {
    const { repo, pushes, id } = await finished(7, 4);
    const a = last(pushes, A, id);
    expect(a.phase).toBe('finished');
    // Два новичка 1000 : 1000 (K = 40): победа +20, поражение -20.
    expect(a.result?.rating).toEqual({ before: 1000, after: 1020, delta: 20 });
    expect(last(pushes, B, id).result?.rating).toEqual({ before: 1000, after: 980, delta: -20 });
    // Рейтинг соперника в карточке обновился.
    expect(a.opponent?.rating).toBe(980);

    const pa = repo.players.get(A)!;
    expect(pa).toMatchObject({
      rating: 1020,
      games: 1,
      wins: 1,
      losses: 0,
      currentStreak: 1,
      bestStreak: 1,
      questionsPlayed: 10,
      duelCorrect: 7,
      totalCorrect: 7,
    });
    expect(pa.correctTimeMs).toBe(7 * 1_500);
    expect(pa.categories.science).toEqual({ answered: 10, correct: 7, wins: 1 });
    expect(repo.players.get(B)).toMatchObject({ rating: 980, games: 1, losses: 1, currentStreak: 0, duelCorrect: 4 });
    expect(repo.players.get(B)!.categories.science).toEqual({ answered: 10, correct: 4, wins: 0 });
    // Ачивки посчитаны (показ - этап 8): первая победа и ответы быстрее 2 секунд.
    expect(a.result?.newAchievements).toEqual(expect.arrayContaining(['first_blood', 'lightning']));
    expect(pa.unlocked.has('first_blood')).toBe(true);
    expect(last(pushes, B, id).result?.newAchievements).toEqual(['lightning']);
    // Итоги записаны вместе со снимком, ровно один раз.
    expect(repo.settledCount).toBe(1);
    expect(repo.rows.get(id)!.settledAt).not.toBeNull();
    expect(repo.rows.get(id)!.state.settlement?.players).toHaveLength(2);
  });

  it('ничья: оба +0, серия обрывается', async () => {
    const base = await setup();
    base.repo.players.set(A, memoryPlayer(A, { currentStreak: 2, bestStreak: 2, games: 3, wins: 2 }));
    const { pushes, repo, id } = await finished(5, 5, base);
    expect(last(pushes, A, id).result).toMatchObject({ outcome: 'draw', rating: { delta: 0 } });
    expect(repo.players.get(A)).toMatchObject({ draws: 1, currentStreak: 0, bestStreak: 2, games: 4 });
  });

  it('техническое поражение - обычное поражение: рейтинг и статистика как за проигрыш, ачивок за победу нет', async () => {
    const { games, repo, pushes } = await setup();
    const id = await start(games);
    await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs + 1_000);
    await games.answer(A, id, 0, correctPos(repo, id, 0));
    await games.answer(B, id, 0, correctPos(repo, id, 0));
    await vi.advanceTimersByTimeAsync(TIMINGS.revealMs);
    await games.forfeit(B, id);
    const a = last(pushes, A, id);
    expect(a.result).toMatchObject({ technical: true, outcome: 'win', rating: { delta: 20 } });
    expect(a.result?.newAchievements).toEqual([]);
    expect(repo.players.get(B)).toMatchObject({ rating: 980, losses: 1, games: 1, questionsPlayed: 1 });
    expect(repo.players.get(A)).toMatchObject({ wins: 1, questionsPlayed: 1, duelCorrect: 1 });
  });

  it('после 10 партий K падает с 40 до 24', async () => {
    const base = await setup();
    base.repo.players.set(A, memoryPlayer(A, { games: 9 }));
    base.repo.players.set(B, memoryPlayer(B, { games: 10 }));
    const { pushes, id } = await finished(7, 4, base);
    expect(last(pushes, A, id).result?.rating?.delta).toBe(20);
    expect(last(pushes, B, id).result?.rating?.delta).toBe(-12);
  });

  it('партия без единого ответа отменяется без рейтинга', async () => {
    const { games, repo, pushes } = await setup();
    const id = await start(games);
    await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs + 10 * (TIMINGS.questionMs + TIMINGS.answerGraceMs + TIMINGS.revealMs));
    expect(last(pushes, A, id)).toMatchObject({ phase: 'cancelled', cancelReason: 'no_answers', result: null });
    expect(repo.settledCount).toBe(0);
    expect(repo.players.get(A)).toBeUndefined();
  });

  it('база не ответила при подсчёте - снимок без рейтинга, повтор досчитывает', async () => {
    const base = await setup();
    base.repo.failNextSettle = true;
    const { repo, pushes, id } = await finished(7, 4, base);
    expect(last(pushes, A, id).result?.rating).toBeNull();
    expect(repo.rows.get(id)!.state.phase).toBe('finished');
    expect(repo.rows.get(id)!.settledAt).toBeFalsy();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(last(pushes, A, id).result?.rating).toEqual({ before: 1000, after: 1020, delta: 20 });
    expect(repo.settledCount).toBe(1);
  });

  it('сервер упал между концом партии и подсчётом - при старте итоги досчитываются один раз', async () => {
    const base = await setup();
    base.repo.failNextSettle = true;
    const { repo, games, id } = await finished(7, 4, base);
    games.stop();
    const fresh = await setup({ repo });
    await fresh.games.restore();
    expect(repo.settledCount).toBe(1);
    expect(repo.players.get(A)?.rating).toBe(1020);
    // Повторный старт не считает второй раз.
    const again = await setup({ repo });
    await again.games.restore();
    expect(repo.settledCount).toBe(1);
    const view = await again.games.sync(A, id);
    expect(view.ok && view.game?.result?.rating?.delta).toBe(20);
  });
});

// ---------------------------------------------------------------------------

describe('реванш', () => {
  it('предложить → у соперника плашка → принять: новая партия той же пары, та же категория, новые вопросы, сразу отсчёт', async () => {
    const { games, repo, pushes, id } = await finished();
    const offer = await games.rematchOffer(A, id);
    expect(offer.ok && offer.game.rematch).toMatchObject({ status: 'offered', byMe: true, canOffer: false, expiresAt: Date.now() + TIMINGS.rematchMs });
    expect(last(pushes, B, id).rematch).toMatchObject({ status: 'offered', byMe: false, canOffer: true });

    await vi.advanceTimersByTimeAsync(5_000);
    const accepted = await games.rematchRespond(B, id, true);
    expect(accepted.ok).toBe(true);
    const old = last(pushes, A, id);
    const nextId = old.rematch?.nextGameId;
    expect(old.rematch?.status).toBe('accepted');
    expect(nextId).toBeTruthy();

    const next = last(pushes, A, nextId!);
    expect(next).toMatchObject({ mode: 'rematch', category: 'science', phase: 'countdown', rematchOf: id, creatorId: A });
    expect(next.phaseEndsAt).toBe(Date.now() + TIMINGS.countdownMs);
    expect(last(pushes, B, nextId!).phase).toBe('countdown');
    expect(games.currentGameOf(A)).toBe(nextId);
    expect(games.currentGameOf(B)).toBe(nextId);
    const prevQ = repo.rows.get(id)!.state.questions.map((q) => q.id);
    const nextQ = repo.rows.get(nextId!)!.state.questions.map((q) => q.id);
    expect(nextQ).toHaveLength(10);
    expect(nextQ.filter((q) => prevQ.includes(q))).toEqual([]);

    // Реванш рейтинговый и доигрывается как обычная партия.
    await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs);
    expect(last(pushes, A, nextId!).phase).toBe('question');
  });

  it('оба нажали «Реванш» почти одновременно - создаётся одна партия', async () => {
    const { games, repo, id } = await finished();
    const [ra, rb] = await Promise.all([games.rematchOffer(A, id), games.rematchOffer(B, id)]);
    expect(ra.ok && rb.ok).toBe(true);
    const rematches = [...repo.rows.values()].filter((r) => r.state.mode === 'rematch');
    expect(rematches).toHaveLength(1);
    expect(repo.rows.get(id)!.state.rematch).toMatchObject({ status: 'accepted', by: A, nextId: rematches[0]!.state.id });
    expect(games.currentGameOf(A)).toBe(rematches[0]!.state.id);
  });

  it('отказ: у предложившего «Соперник отказался», кнопка неактивна у обоих', async () => {
    const { games, pushes, id } = await finished();
    await games.rematchOffer(A, id);
    await games.rematchRespond(B, id, false);
    expect(last(pushes, A, id).rematch).toMatchObject({ status: 'declined', byMe: true, canOffer: false, blocked: 'closed' });
    expect(last(pushes, B, id).rematch).toMatchObject({ status: 'declined', canOffer: false });
    expect(await games.rematchOffer(B, id)).toEqual({ ok: false, error: 'rematch_closed' });
    expect(await games.rematchRespond(B, id, true)).toEqual({ ok: false, error: 'rematch_closed' });
  });

  it('нет ответа 30 с - таймаут, согласие после него не принимается', async () => {
    const { games, pushes, repo, id } = await finished();
    await games.rematchOffer(A, id);
    await vi.advanceTimersByTimeAsync(TIMINGS.rematchMs);
    expect(last(pushes, A, id).rematch).toMatchObject({ status: 'expired', canOffer: false });
    expect(await games.rematchRespond(B, id, true)).toEqual({ ok: false, error: 'rematch_closed' });
    expect([...repo.rows.values()].some((r) => r.state.mode === 'rematch')).toBe(false);
  });

  it('предложивший отменил - кнопка снова активна у обоих', async () => {
    const { games, pushes, id } = await finished();
    await games.rematchOffer(A, id);
    expect((await games.rematchCancel(A, id)).ok).toBe(true);
    expect(last(pushes, B, id).rematch).toMatchObject({ status: null, canOffer: true });
    expect(await games.rematchCancel(B, id)).toEqual({ ok: false, error: 'rematch_closed' });
    expect((await games.rematchOffer(B, id)).ok).toBe(true);
  });

  it('соперник ушёл на главную - «Соперник вышел», ждущее предложение закрывается', async () => {
    const { games, pushes, id } = await finished();
    await games.rematchOffer(A, id);
    await games.leave(B, id);
    expect(last(pushes, A, id).rematch).toMatchObject({ status: 'left', canOffer: false });
    expect(last(pushes, A, id).opponent?.left).toBe(true);
  });

  it('соперник уже вышел - предложить нельзя, кнопка неактивна; вернулся на итоги - снова можно', async () => {
    const { games, pushes, id } = await finished();
    await games.disconnect(B);
    expect(last(pushes, A, id).rematch).toMatchObject({ canOffer: false, blocked: 'opponentLeft' });
    expect(await games.rematchOffer(A, id)).toEqual({ ok: false, error: 'opponent_left' });
    await games.connect(B);
    expect(last(pushes, A, id).rematch).toMatchObject({ canOffer: true, blocked: null });
  });

  it('согласие, когда предложивший уже пропал со связи: партия не создаётся, «Соперник вышел»', async () => {
    const { games, pushes, repo, id } = await finished();
    await games.rematchOffer(A, id);
    // Вкладка закрылась, а сервер ещё не обработал отключение - проверка по реальным подключениям.
    await games.disconnect(A);
    expect(await games.rematchRespond(B, id, true)).toEqual({ ok: false, error: 'opponent_left' });
    expect(last(pushes, B, id).rematch?.status).toBe('left');
    expect([...repo.rows.values()].some((r) => r.state.mode === 'rematch')).toBe(false);
  });

  it('соперник ушёл в другую игру - реванш ему больше не предложить', async () => {
    const { games, pushes, id } = await finished();
    await games.connect(C);
    const other = await games.create(C, 'mix');
    if (!other.ok) throw new Error(other.error);
    await games.join(B, other.game.id);
    expect(last(pushes, A, id).rematch).toMatchObject({ canOffer: false, blocked: 'opponentLeft' });
  });

  it('после технического исхода реванш недоступен обоим', async () => {
    const { games, pushes } = await setup();
    const id = await start(games);
    await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs);
    await games.forfeit(B, id);
    expect(last(pushes, A, id).rematch).toMatchObject({ canOffer: false, blocked: 'technical' });
    expect(last(pushes, B, id).rematch).toMatchObject({ canOffer: false, blocked: 'technical' });
    expect(await games.rematchOffer(A, id)).toEqual({ ok: false, error: 'rematch_unavailable' });
  });

  it('посторонний не может предложить, принять или отменить', async () => {
    const { games, id } = await finished();
    await games.rematchOffer(A, id);
    expect(await games.rematchOffer(C, id)).toEqual({ ok: false, error: 'not_participant' });
    expect(await games.rematchRespond(C, id, true)).toEqual({ ok: false, error: 'not_participant' });
    expect(await games.rematchCancel(C, id)).toEqual({ ok: false, error: 'not_participant' });
    // Сам себе ответить нельзя.
    expect(await games.rematchRespond(A, id, true)).toEqual({ ok: false, error: 'rematch_closed' });
  });

  it('предложение переживает перезапуск сервера: таймер 30 с идёт от сохранённого дедлайна', async () => {
    const { games, repo, id } = await finished();
    await games.rematchOffer(A, id);
    await vi.advanceTimersByTimeAsync(10_000);
    games.stop();
    const fresh = await setup({ repo });
    await fresh.games.connect(A);
    await fresh.games.connect(B);
    const view = await fresh.games.sync(B, id);
    expect(view.ok && view.game?.rematch).toMatchObject({ status: 'offered', byMe: false });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(last(fresh.pushes, B, id).rematch?.status).toBe('expired');
  });

  it('«Реваншист»: победа в реванше после поражения', async () => {
    const env = await setup();
    const id = await start(env.games);
    await playOut(env.games, env.repo, id, 2, 8); // A проиграл
    await env.games.rematchOffer(A, id);
    await env.games.rematchRespond(B, id, true);
    const nextId = env.repo.rows.get(id)!.state.rematch!.nextId!;
    await playOut(env.games, env.repo, nextId, 8, 2); // и отыгрался
    expect(last(env.pushes, A, nextId).result?.newAchievements).toContain('revenge');
    expect(last(env.pushes, B, nextId).result?.newAchievements ?? []).not.toContain('revenge');
  });
});
