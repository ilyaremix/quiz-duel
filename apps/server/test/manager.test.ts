import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMINGS, type GameStateMeta, type GameView } from '@quiz-duel/shared';
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
  it('оба готовы - отсчёт 3 с, потом первый вопрос без верного ответа в снимке', async () => {
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
