import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pointsFor, TIMINGS, type GameStateMeta, type GameView } from '@quiz-duel/shared';
import { CREATE_LIMIT, GameManager, type InviteMaker } from '../src/game/manager.js';
import { memoryGamesRepo } from '../src/game/repo.js';
import { loadQuestionBank } from '../src/questions/bank.js';
import type { TelegramUser } from '../src/auth/initData.js';
import { DOCS_VERSION, memoryUsers } from './helpers.js';

const A = 1001;
const B = 1002;
const C = 1003;
const bank = loadQuestionBank();

type Push = { userId: number; view: GameView; meta?: GameStateMeta };

async function setup(options: { consent?: number[]; invites?: InviteMaker; repo?: ReturnType<typeof memoryGamesRepo> } = {}) {
  const users = memoryUsers();
  const repo = options.repo ?? memoryGamesRepo();
  const pushes: Push[] = [];
  const consent = options.consent ?? [A, B, C];
  for (const [id, name] of [[A, 'Илья'], [B, 'Марк'], [C, 'Аня']] as const) {
    const tg: TelegramUser = { id, first_name: name, language_code: id === B ? 'en' : 'ru' };
    await users.upsertFromTelegram(tg);
    if (consent.includes(id)) users.rows.get(id)!.docsVersion = DOCS_VERSION;
  }
  let n = 0;
  const games = new GameManager({
    repo,
    users,
    bank,
    notify: { state: (userId, view, meta) => pushes.push({ userId, view, meta }) },
    appUrl: 'https://t.me/quiz_test_bot/play',
    docsVersion: DOCS_VERSION,
    log: { error: () => {}, warn: () => {}, info: () => {} },
    invites: options.invites,
    newId: () => `Game${String(++n).padStart(6, '0')}`,
  });
  managers.push(games);
  return { games, users, repo, pushes };
}

const managers: GameManager[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
});

afterEach(() => {
  managers.splice(0).forEach((m) => m.stop());
  vi.useRealTimers();
});

async function lobby(games: GameManager) {
  await games.connect(A);
  await games.connect(B);
  const created = await games.create(A, 'science');
  if (!created.ok) throw new Error(created.error);
  const joined = await games.join(B, created.game.id);
  if (!joined.ok) throw new Error(joined.error);
  return created.game.id;
}

describe('создание и ссылка', () => {
  it('создатель попадает в своё лобби «ждём соперника», партия сразу в базе', async () => {
    const { games, repo } = await setup();
    await games.connect(A);
    const res = await games.create(A, 'history');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.game).toMatchObject({ phase: 'waiting', category: 'history', creatorId: A, opponent: null });
    expect(res.game.me).toMatchObject({ userId: A, name: 'Илья', rating: 1000, online: true });
    expect(res.game.lobbyExpiresAt).toBe(Date.now() + TIMINGS.lobbyTtlMs);
    expect(repo.rows.get(res.game.id)?.state.phase).toBe('waiting');
    expect(games.currentGameOf(A)).toBe(res.game.id);
  });

  it('без принятия документов создать нельзя', async () => {
    const { games } = await setup({ consent: [B] });
    expect(await games.create(A, 'mix')).toEqual({ ok: false, error: 'consent_required' });
  });

  it('лимит: не больше 10 игр в минуту', async () => {
    const { games } = await setup();
    for (let i = 0; i < CREATE_LIMIT.max; i++) expect((await games.create(A, 'mix')).ok).toBe(true);
    expect(await games.create(A, 'mix')).toEqual({ ok: false, error: 'rate_limited' });
    vi.advanceTimersByTime(CREATE_LIMIT.windowMs);
    expect((await games.create(A, 'mix')).ok).toBe(true);
  });

  it('новая игра закрывает своё старое пустое лобби', async () => {
    const { games } = await setup();
    const first = await games.create(A, 'mix');
    const second = await games.create(A, 'sport');
    if (!first.ok || !second.ok) throw new Error('create failed');
    expect(games.currentGameOf(A)).toBe(second.game.id);
    const old = await games.sync(A, first.game.id);
    expect(old.ok && old.game?.phase).toBe('cancelled');
  });

  it('приглашение: ссылка startapp=g_<id> и подготовленное сообщение (кэшируется)', async () => {
    const prepare = vi.fn<InviteMaker["prepare"]>(async () => ({ id: "prep-1", expiresAt: Date.now() + 24 * 3600_000 }));
    const { games } = await setup({ invites: { prepare } });
    const res = await games.create(A, 'tech');
    if (!res.ok) throw new Error(res.error);
    const invite = await games.invite(A, res.game.id);
    expect(invite).toEqual({ ok: true, link: `https://t.me/quiz_test_bot/play?startapp=g_${res.game.id}`, preparedMessageId: 'prep-1' });
    await games.invite(A, res.game.id);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]![0]).toMatchObject({ userId: A, category: 'tech', lang: 'ru', creatorName: 'Илья' });
    expect((await games.invite(B, res.game.id)).ok).toBe(false);
  });

  it('бот не смог подготовить сообщение - ссылка всё равно есть', async () => {
    const { games } = await setup({ invites: { prepare: async () => Promise.reject(new Error('telegram down')) } });
    const res = await games.create(A, 'tech');
    if (!res.ok) throw new Error(res.error);
    const invite = await games.invite(A, res.game.id);
    expect(invite).toMatchObject({ ok: true, preparedMessageId: null });
  });
});

describe('вход соперника', () => {
  it('первый открывший занимает место; создатель и соперник получают снимок с карточками', async () => {
    const { games, pushes } = await setup();
    const id = await lobby(games);
    const last = pushes.filter((p) => p.userId === A).at(-1)!;
    expect(last.view.phase).toBe('lobby');
    expect(last.view.opponent).toMatchObject({ userId: B, name: 'Марк', ready: false, online: true });
    const res = await games.sync(B, id);
    expect(res.ok && res.game?.me.userId).toBe(B);
  });

  it('двое открыли ссылку одновременно - место получает ровно один', async () => {
    const { games } = await setup();
    const created = await games.create(A, 'mix');
    if (!created.ok) throw new Error(created.error);
    const [b, c] = await Promise.all([games.join(B, created.game.id), games.join(C, created.game.id)]);
    const results = [b, c].map((r) => (r.ok ? 'ok' : r.error)).sort();
    expect(results).toEqual(['ok', 'taken']);
  });

  it('создатель открыл свою ссылку - своё лобби, соперником не становится', async () => {
    const { games } = await setup();
    const created = await games.create(A, 'mix');
    if (!created.ok) throw new Error(created.error);
    const res = await games.join(A, created.game.id);
    expect(res.ok && res.game).toMatchObject({ phase: 'waiting', opponent: null, creatorId: A });
  });

  it('третий открыл ссылку - «Партия уже занята»', async () => {
    const { games } = await setup();
    const id = await lobby(games);
    expect(await games.join(C, id)).toEqual({ ok: false, error: 'taken' });
  });

  it('неизвестная игра - not_found', async () => {
    const { games } = await setup();
    expect(await games.join(B, 'NoSuchGame')).toEqual({ ok: false, error: 'not_found' });
  });

  it('без принятия документов: consent_required и кто зовёт; после принятия - вход', async () => {
    const { games, users } = await setup({ consent: [A] });
    const created = await games.create(A, 'mix');
    if (!created.ok) throw new Error(created.error);
    const res = await games.join(B, created.game.id);
    expect(res).toMatchObject({ ok: false, error: 'consent_required', inviter: { name: 'Илья', rating: 1000 } });
    users.rows.get(B)!.docsVersion = DOCS_VERSION;
    expect((await games.join(B, created.game.id)).ok).toBe(true);
  });

  it('принята старая версия документов - создать и войти нельзя (consent_required), пока не примет новую', async () => {
    const { games, users } = await setup();
    const created = await games.create(A, 'mix');
    if (!created.ok) throw new Error(created.error);
    users.rows.get(A)!.docsVersion = '2026-01-01';
    users.rows.get(B)!.docsVersion = '2026-01-01';
    expect(await games.create(A, 'science')).toMatchObject({ ok: false, error: 'consent_required' });
    expect(await games.join(B, created.game.id)).toMatchObject({ ok: false, error: 'consent_required' });
    users.rows.get(B)!.docsVersion = DOCS_VERSION;
    expect((await games.join(B, created.game.id)).ok).toBe(true);
  });

  it('мёртвая ссылка отвечает сразу, без шторки документов', async () => {
    const { games } = await setup({ consent: [A, B] });
    const id = await lobby(games);
    expect(await games.join(C, id)).toEqual({ ok: false, error: 'taken' });
  });

  it('игрок посреди дуэли открыл чужую ссылку - busy и id текущей партии', async () => {
    const { games } = await setup();
    const id = await lobby(games);
    await games.ready(A, id, true);
    await games.ready(B, id, true);
    await games.connect(C);
    const other = await games.create(C, 'mix');
    if (!other.ok) throw new Error(other.error);
    expect(await games.join(B, other.game.id)).toEqual({ ok: false, error: 'busy', busyGameId: id });
    expect(await games.create(A, 'mix')).toEqual({ ok: false, error: 'busy', busyGameId: id });
  });

  it('из лобби по чужой ссылке: место в старом лобби освобождается', async () => {
    const { games, pushes } = await setup();
    const id = await lobby(games);
    await games.connect(C);
    const other = await games.create(C, 'mix');
    if (!other.ok) throw new Error(other.error);
    expect((await games.join(B, other.game.id)).ok).toBe(true);
    const toCreator = pushes.filter((p) => p.userId === A).at(-1)!;
    expect(toCreator.view).toMatchObject({ id, phase: 'waiting', opponent: null });
    expect(toCreator.meta).toEqual({ seatFreed: 'left' });
  });
});

describe('«Готов» и отсчёт', () => {
  it('оба готовы - отсчёт (лобби + VS), потом первый вопрос без верного ответа в снимке', async () => {
    const { games, pushes, repo } = await setup();
    const id = await lobby(games);
    const a = await games.ready(A, id, true);
    expect(a.ok && a.game.me.ready).toBe(true);
    const b = await games.ready(B, id, true);
    expect(b.ok && b.game.phase).toBe('countdown');
    expect(b.ok && b.game.phaseEndsAt).toBe(Date.now() + TIMINGS.countdownMs);
    expect(repo.rows.get(id)?.startedAt).toBe(Date.now());

    await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs);
    const q = pushes.filter((p) => p.userId === B).at(-1)!.view;
    expect(q.phase).toBe('question');
    expect(q.question?.index).toBe(0);
    expect(q.reveal).toBeNull();
    expect(JSON.stringify(q)).not.toMatch(/correct/i);
    // Каждый видит вопрос на своём языке.
    const qa = pushes.filter((p) => p.userId === A).at(-1)!.view;
    expect(qa.question?.questionId).toBe(q.question?.questionId);
    expect(qa.question?.text).not.toBe(q.question?.text);
  });

  it('«Готов» можно снять, в том числе во время отсчёта - назад в лобби', async () => {
    const { games } = await setup();
    const id = await lobby(games);
    await games.ready(A, id, true);
    await games.ready(B, id, true);
    const res = await games.ready(A, id, false);
    expect(res.ok && res.game.phase).toBe('lobby');
    await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs * 2);
    const now = await games.sync(A, id);
    expect(now.ok && now.game?.phase).toBe('lobby');
  });

  it('посторонний не может нажать «Готов»', async () => {
    const { games } = await setup();
    const id = await lobby(games);
    expect(await games.ready(C, id, true)).toEqual({ ok: false, error: 'not_participant' });
  });

  it('вопросы подбираются без недавно сыгранных этими игроками', async () => {
    const repo = memoryGamesRepo();
    const { games } = await setup({ repo });
    const id = await lobby(games);
    await games.ready(A, id, true);
    await games.ready(B, id, true);
    const firstIds = repo.rows.get(id)!.state.questions.map((q) => q.id);
    managers.splice(0).forEach((m) => m.stop());

    // В «Науке» 20 вопросов: второй партии хватает 10 несыгранных.
    const second = await setup({ repo });
    const id2 = await lobby(second.games);
    await second.games.ready(A, id2, true);
    await second.games.ready(B, id2, true);
    const secondIds = repo.rows.get(id2)!.state.questions.map((q) => q.id);
    expect(secondIds.filter((q) => firstIds.includes(q))).toEqual([]);
  });
});

describe('таймауты лобби', () => {
  it('соперник так и не пришёл - лобби истекает через 15 минут, ссылка: expired', async () => {
    const { games, pushes } = await setup();
    const created = await games.create(A, 'mix');
    if (!created.ok) throw new Error(created.error);
    await vi.advanceTimersByTimeAsync(TIMINGS.lobbyTtlMs);
    expect(pushes.at(-1)!.view.phase).toBe('expired');
    expect(await games.join(B, created.game.id)).toEqual({ ok: false, error: 'expired' });
    expect(games.currentGameOf(A)).toBeNull();
  });

  it('соперник зашёл и ушёл до «Готов» - через 60 с место свободно, ссылка снова работает', async () => {
    const { games, pushes } = await setup();
    const id = await lobby(games);
    await games.disconnect(B);
    const off = pushes.filter((p) => p.userId === A).at(-1)!.view;
    expect(off.opponent).toMatchObject({ online: false, seatFreesAt: Date.now() + TIMINGS.lobbyOfflineMs });

    await vi.advanceTimersByTimeAsync(TIMINGS.lobbyOfflineMs);
    const freed = pushes.filter((p) => p.userId === A).at(-1)!;
    expect(freed.view).toMatchObject({ phase: 'waiting', opponent: null });
    expect(freed.meta).toEqual({ seatFreed: 'timeout' });
    expect(games.currentGameOf(B)).toBeNull();
    expect((await games.join(C, id)).ok).toBe(true);
  });

  it('соперник вернулся раньше 60 с - остаётся в лобби', async () => {
    const { games } = await setup();
    const id = await lobby(games);
    await games.disconnect(B);
    await vi.advanceTimersByTimeAsync(TIMINGS.lobbyOfflineMs - 5_000);
    await games.connect(B);
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await games.sync(A, id);
    expect(res.ok && res.game?.opponent).toMatchObject({ userId: B, online: true, seatFreesAt: null });
  });

  it('создатель ушёл из лобби - лобби живёт, соперник видит «не в сети»', async () => {
    const { games, pushes } = await setup();
    const id = await lobby(games);
    await games.disconnect(A);
    await vi.advanceTimersByTimeAsync(TIMINGS.lobbyOfflineMs * 2);
    const view = pushes.filter((p) => p.userId === B).at(-1)!.view;
    expect(view).toMatchObject({ id, phase: 'lobby' });
    expect(view.opponent).toMatchObject({ userId: A, online: false, seatFreesAt: null });
  });

  it('несколько подключений одного игрока: офлайн только когда закрылось последнее', async () => {
    const { games } = await setup();
    const id = await lobby(games);
    await games.connect(B);
    await games.disconnect(B);
    const res = await games.sync(A, id);
    expect(res.ok && res.game?.opponent?.online).toBe(true);
  });
});

describe('отмена и выход', () => {
  it('создатель отменяет - игра отменена, ссылка: cancelled', async () => {
    const { games, pushes } = await setup();
    const id = await lobby(games);
    expect(await games.cancel(B, id)).toEqual({ ok: false, error: 'not_creator' });
    const res = await games.cancel(A, id);
    expect(res.ok && res.game.phase).toBe('cancelled');
    expect(pushes.filter((p) => p.userId === B).at(-1)!.view).toMatchObject({ phase: 'cancelled', cancelReason: 'creator' });
    expect(await games.join(C, id)).toEqual({ ok: false, error: 'cancelled' });
  });

  it('соперник выходит из лобби - место сразу свободно', async () => {
    const { games, pushes } = await setup();
    const id = await lobby(games);
    expect((await games.leave(B, id)).ok).toBe(true);
    const toCreator = pushes.filter((p) => p.userId === A).at(-1)!;
    expect(toCreator.view).toMatchObject({ phase: 'waiting', opponent: null });
    expect(toCreator.meta).toEqual({ seatFreed: 'left' });
    expect(games.currentGameOf(B)).toBeNull();
  });

  it('завершённая игра: участник получает снимок, посторонний - finished', async () => {
    const { games, repo } = await setup();
    const id = await lobby(games);
    const s = repo.rows.get(id)!.state;
    // Имитируем сыгранную партию в базе (итоги считает этап 7).
    managers.splice(0).forEach((m) => m.stop());
    repo.rows.set(id, { state: { ...s, phase: 'finished', finish: { reason: 'completed', winnerId: A, at: Date.now() } }, startedAt: Date.now() });
    const fresh = await setup({ repo });
    const mine = await fresh.games.join(B, id);
    expect(mine.ok && mine.game.phase).toBe('finished');
    expect(await fresh.games.join(C, id)).toEqual({ ok: false, error: 'finished' });
  });
});

describe('перезапуск сервера', () => {
  it('партия поднимается из базы, игроки возвращаются в неё без ссылки', async () => {
    const repo = memoryGamesRepo();
    const first = await setup({ repo });
    const id = await lobby(first.games);
    first.games.stop();

    const second = await setup({ repo });
    expect(await second.games.restore()).toBe(1);
    expect(await second.games.connect(A)).toBe(id);
    const res = await second.games.sync(A);
    expect(res.ok && res.game).toMatchObject({ id, phase: 'lobby' });
  });

  it('отсчёт, начатый до перезапуска, продолжается по сохранённому дедлайну', async () => {
    const repo = memoryGamesRepo();
    const first = await setup({ repo });
    const id = await lobby(first.games);
    await first.games.ready(A, id, true);
    await first.games.ready(B, id, true);
    first.games.stop();
    vi.advanceTimersByTime(1_000);

    const second = await setup({ repo });
    await second.games.restore();
    await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs - 1_000);
    expect(repo.rows.get(id)!.state.phase).toBe('question');
  });

  it('просроченные за время простоя фазы закрываются сразу', async () => {
    const repo = memoryGamesRepo();
    const first = await setup({ repo });
    const created = await first.games.create(A, 'mix');
    if (!created.ok) throw new Error(created.error);
    first.games.stop();
    vi.advanceTimersByTime(TIMINGS.lobbyTtlMs + 1_000);

    const second = await setup({ repo });
    await second.games.restore();
    expect(repo.rows.get(created.game.id)!.state.phase).toBe('expired');
    expect(second.games.currentGameOf(A)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Этап 5: партия

/** Лобби → оба «Готов» → отсчёт прошёл, идёт вопрос 1. */
async function playing(games: GameManager) {
  const id = await lobby(games);
  await games.ready(A, id, true);
  await games.ready(B, id, true);
  await vi.advanceTimersByTimeAsync(TIMINGS.countdownMs);
  return id;
}

/** Позиция верного варианта на экране - знает только сервер (здесь - тест через базу). */
function correctPos(repo: ReturnType<typeof memoryGamesRepo>, id: string, index: number) {
  const q = repo.rows.get(id)!.state.questions[index]!;
  return q.order.indexOf(bank.byId.get(q.id)!.correct);
}
const wrongPos = (right: number) => (right + 1) % 4;
const lastView = (pushes: Push[], userId: number) => pushes.filter((p) => p.userId === userId).at(-1)!.view;

describe('партия: ответы', () => {
  it('ответили оба - вопрос сразу закрывается, на раскрытии верный вариант, выбор и очки обоих', async () => {
    const { games, repo, pushes } = await setup();
    const id = await playing(games);
    const right = correctPos(repo, id, 0);

    await vi.advanceTimersByTimeAsync(3_000);
    const a = await games.answer(A, id, 0, right);
    expect(a.ok && a.accepted).toBe(true);
    expect(a.ok && a.game.myAnswer).toEqual({ position: right });
    // Пока вопрос открыт, сопернику видно только «ответил», без варианта и верного ответа.
    const toB = lastView(pushes, B);
    expect(toB.opponentAnswered).toBe(true);
    expect(toB.reveal).toBeNull();
    expect(JSON.stringify(toB)).not.toContain(`"position":${right}`);

    await vi.advanceTimersByTimeAsync(6_000);
    await games.answer(B, id, 0, wrongPos(right));
    const ra = lastView(pushes, A);
    expect(ra.phase).toBe('reveal');
    expect(ra.reveal).toEqual({
      index: 0,
      correctPosition: right,
      me: { position: right, points: 900, timeMs: 3_000 },
      opponent: { position: wrongPos(right), points: 0, timeMs: 9_000 },
    });
    expect(ra.me.score).toBe(900);
    expect(lastView(pushes, B).reveal?.me.points).toBe(0);
    expect(repo.answers).toEqual([`${id}/${A}/0`, `${id}/${B}/0`]);

    // Через 3 с раскрытия - следующий вопрос.
    await vi.advanceTimersByTimeAsync(TIMINGS.revealMs);
    expect(lastView(pushes, A)).toMatchObject({ phase: 'question', question: { index: 1 }, myAnswer: null, reveal: null });
  });

  it('повторный ответ (двойной тап, повтор после реконнекта) не меняет первый', async () => {
    const { games, repo } = await setup();
    const id = await playing(games);
    const right = correctPos(repo, id, 0);
    await games.answer(A, id, 0, wrongPos(right));
    const again = await games.answer(A, id, 0, right);
    expect(again.ok && again.accepted).toBe(false);
    expect(again.ok && again.game.myAnswer).toEqual({ position: wrongPos(right) });
    expect(repo.rows.get(id)!.state.creator.answers[0]?.correct).toBe(false);
    expect(repo.answers).toHaveLength(1);
  });

  it('ответ в допуске на сеть после 15 с даёт 500, после допуска - не засчитан', async () => {
    const { games, repo } = await setup();
    const id = await playing(games);
    await vi.advanceTimersByTimeAsync(TIMINGS.questionMs + 100);
    const a = await games.answer(A, id, 0, correctPos(repo, id, 0));
    expect(a.ok && a.accepted).toBe(true);
    expect(repo.rows.get(id)!.state.creator.answers[0]?.points).toBe(500);
    await vi.advanceTimersByTimeAsync(TIMINGS.answerGraceMs);
    // Вопрос уже закрыт по таймеру.
    expect(await games.answer(B, id, 0, 0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('ответ на другой вопрос, чужой партии или посторонним отклоняется', async () => {
    const { games } = await setup();
    const id = await playing(games);
    expect(await games.answer(A, id, 1, 0)).toEqual({ ok: false, error: 'wrong_question' });
    expect(await games.answer(C, id, 0, 0)).toEqual({ ok: false, error: 'not_participant' });
    expect(await games.answer(A, 'Nope000000', 0, 0)).toEqual({ ok: false, error: 'not_found' });
  });

  it('до старта вопроса ответить нельзя', async () => {
    const { games } = await setup();
    const id = await lobby(games);
    await games.ready(A, id, true);
    await games.ready(B, id, true);
    expect(await games.answer(A, id, 0, 0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('никто не ответил - вопрос закрывается по таймеру, «время вышло» у обоих', async () => {
    const { games, pushes } = await setup();
    await playing(games);
    await vi.advanceTimersByTimeAsync(TIMINGS.questionMs + TIMINGS.answerGraceMs);
    const v = lastView(pushes, A);
    expect(v.phase).toBe('reveal');
    expect(v.reveal?.me).toEqual({ position: null, points: 0, timeMs: null });
    expect(v.reveal?.opponent).toEqual({ position: null, points: 0, timeMs: null });
  });

  it('10 вопросов - итоги с исходом и цифрами для каждого', async () => {
    const { games, repo, pushes } = await setup();
    const id = await playing(games);
    for (let i = 0; i < 10; i++) {
      const right = correctPos(repo, id, i);
      await vi.advanceTimersByTimeAsync(1_500);
      await games.answer(A, id, i, i < 7 ? right : wrongPos(right));
      await vi.advanceTimersByTimeAsync(1_500);
      await games.answer(B, id, i, i < 4 ? right : wrongPos(right));
      await vi.advanceTimersByTimeAsync(TIMINGS.revealMs);
    }
    const a = lastView(pushes, A);
    expect(a.phase).toBe('finished');
    expect(a.result).toMatchObject({
      reason: 'completed',
      outcome: 'win',
      technical: false,
      leaverId: null,
      stats: { correct: 7, played: 10, avgMs: 1_500 },
    });
    expect(lastView(pushes, B).result).toMatchObject({ outcome: 'loss', stats: { correct: 4, played: 10, avgMs: 3_000 } });
    expect(games.currentGameOf(A)).toBeNull();
    // Участник по ссылке видит итоги завершённой партии.
    const again = await games.join(A, id);
    expect(again.ok && again.game.result?.outcome).toBe('win');
  });
});

describe('партия: сдача и уход', () => {
  it('«Выйти из партии» - сразу техническая победа сопернику', async () => {
    const { games, pushes } = await setup();
    const id = await playing(games);
    const res = await games.forfeit(A, id);
    expect(res.ok && res.game.result).toMatchObject({ reason: 'forfeit', outcome: 'loss', technical: true, leaverId: A });
    expect(lastView(pushes, B).result).toMatchObject({ reason: 'forfeit', outcome: 'win', technical: true, leaverId: A });
    expect(games.currentGameOf(B)).toBeNull();
    expect(await games.forfeit(B, id)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('посторонний не может сдать чужую партию', async () => {
    const { games } = await setup();
    const id = await playing(games);
    expect(await games.forfeit(C, id)).toEqual({ ok: false, error: 'not_participant' });
  });

  it('соперник отключился - у второго отсчёт 30 с, потом техническая победа', async () => {
    const { games, pushes } = await setup();
    const id = await playing(games);
    await games.disconnect(B);
    const a = lastView(pushes, A);
    expect(a.opponent).toMatchObject({ online: false, graceEndsAt: Date.now() + TIMINGS.reconnectGraceMs });
    // Партия идёт дальше: вопрос закрывается по таймеру.
    await vi.advanceTimersByTimeAsync(TIMINGS.questionMs + TIMINGS.answerGraceMs);
    expect(lastView(pushes, A).phase).toBe('reveal');
    await vi.advanceTimersByTimeAsync(TIMINGS.reconnectGraceMs);
    expect(lastView(pushes, A).result).toMatchObject({ reason: 'abandoned', outcome: 'win', leaverId: B });
    expect((await games.sync(B, id)).ok).toBe(true);
  });

  it('вернулся до конца 30 с - отсчёт сбрасывается, игра идёт с текущего вопроса', async () => {
    const { games, pushes } = await setup();
    const id = await playing(games);
    await games.disconnect(B);
    await vi.advanceTimersByTimeAsync(10_000);
    await games.connect(B);
    expect(lastView(pushes, A).opponent).toMatchObject({ online: true, graceEndsAt: null });
    const b = await games.sync(B);
    expect(b.ok && b.game).toMatchObject({ id, phase: 'question', question: { index: 0 } });
    await vi.advanceTimersByTimeAsync(TIMINGS.reconnectGraceMs);
    expect(lastView(pushes, A).phase).not.toBe('finished');
  });

  it('перезапуск сервера посреди вопроса: дедлайн и ответ сохраняются', async () => {
    const repo = memoryGamesRepo();
    const first = await setup({ repo });
    const id = await playing(first.games);
    const right = correctPos(repo, id, 0);
    await vi.advanceTimersByTimeAsync(2_000);
    await first.games.answer(A, id, 0, right);
    first.games.stop();
    vi.advanceTimersByTime(1_000);

    const second = await setup({ repo });
    await second.games.restore();
    await second.games.connect(A);
    await second.games.connect(B);
    const again = await second.games.answer(A, id, 0, wrongPos(right));
    expect(again.ok && again.accepted).toBe(false);
    await vi.advanceTimersByTimeAsync(TIMINGS.questionMs - 3_000 + TIMINGS.answerGraceMs);
    const state = repo.rows.get(id)!.state;
    expect(state.phase).toBe('reveal');
    expect(state.creator.score).toBe(pointsFor(true, 2_000));
  });
});
