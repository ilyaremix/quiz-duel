/**
 * Этап 7: реванш с двумя настоящими сокет-клиентами против настоящего сервера.
 * Время сервера - JumpClock (30 с ожидания перематываются сразу).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { SOCKET_PATH, TIMINGS, type ClientToServerEvents, type GameView, type ServerToClientEvents } from '@quiz-duel/shared';
import { attachSocket, socketNotifier, type IoServer } from '../src/socket.js';
import { GameManager } from '../src/game/manager.js';
import { memoryGamesRepo } from '../src/game/repo.js';
import { loadQuestionBank } from '../src/questions/bank.js';
import type { TelegramUser } from '../src/auth/initData.js';
import { BOT_TOKEN, DOCS_VERSION, ilya, makeInitData, memoryUsers } from './helpers.js';
import { JumpClock } from './jumpClock.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const mark: TelegramUser = { id: 200300, first_name: 'Марк', username: 'mark_k', language_code: 'en' };
const bank = loadQuestionBank();
const silentLog = { error() {}, warn() {}, info() {} } as never;

interface World {
  clock: JumpClock;
  repo: ReturnType<typeof memoryGamesRepo>;
  http: Server;
  io: IoServer;
  games: GameManager;
  port: number;
}

const worlds: World[] = [];
const clients: ClientSocket[] = [];

async function world(): Promise<World> {
  const users = memoryUsers();
  for (const u of [ilya, mark]) {
    await users.upsertFromTelegram(u);
    users.rows.get(u.id)!.docsVersion = DOCS_VERSION;
  }
  const clock = new JumpClock();
  const repo = memoryGamesRepo();
  // Как в настоящей базе: рейтинг в карточке игрока - тот, что записали итоги.
  const cards = users.cards.bind(users);
  users.cards = async (ids) => {
    const out = await cards(ids);
    for (const [id, card] of out) card.rating = repo.players.get(id)?.rating ?? card.rating;
    return out;
  };
  const http = createServer();
  let io: IoServer | null = null;
  const games = new GameManager({
    repo,
    users,
    bank,
    notify: socketNotifier(() => io),
    appUrl: 'https://t.me/quiz_test_bot/play',
    docsVersion: DOCS_VERSION,
    log: silentLog,
    clock,
  });
  io = attachSocket(http, { botToken: BOT_TOKEN, maxAgeSec: 86_400, origin: 'https://quiz.example.sslip.io', log: silentLog, games, now: clock.now });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const w: World = { clock, repo, http, io, games, port: (http.address() as AddressInfo).port };
  worlds.push(w);
  return w;
}

afterEach(async () => {
  clients.splice(0).forEach((socket) => socket.close());
  for (const w of worlds.splice(0)) {
    await w.games.shutdown();
    await new Promise<void>((resolve) => w.io.close(() => resolve()));
    w.clock.dispose();
  }
});

interface Player {
  socket: ClientSocket;
  states: GameView[];
}

function player(w: World, user: TelegramUser): Promise<Player> {
  const socket: ClientSocket = connect(`http://127.0.0.1:${w.port}`, {
    path: SOCKET_PATH,
    auth: { initData: makeInitData({ user }) },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  const p: Player = { socket, states: [] };
  socket.on('game:state', (view) => p.states.push(view));
  return new Promise((resolve, reject) => {
    socket.once('session:hello', () => resolve(p));
    socket.once('connect_error', reject);
  });
}

async function until<T>(fn: () => T | undefined | null | false, what: string, timeoutMs = 3_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`не дождались: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const stateWhere = (p: Player, what: string, pred: (v: GameView) => boolean) => until(() => p.states.find(pred), what);
const lastOf = (p: Player, gameId: string) => p.states.filter((v) => v.id === gameId).at(-1);

/** Полная партия: оба отвечают сразу (Илья - первым вариантом, Марк - вторым). */
async function playDuel(w: World, a: Player, b: Player, gameId: string) {
  await w.clock.advance(TIMINGS.countdownMs);
  for (let i = 0; i < 10; i++) {
    await stateWhere(a, `вопрос ${i + 1}`, (v) => v.id === gameId && v.phase === 'question' && v.question?.index === i);
    await a.socket.emitWithAck('game:answer', { gameId, questionIndex: i, optionIndex: 0 });
    await b.socket.emitWithAck('game:answer', { gameId, questionIndex: i, optionIndex: 1 });
    await stateWhere(a, `раскрытие ${i + 1}`, (v) => v.id === gameId && v.phase === 'reveal' && v.reveal?.index === i);
    await w.clock.advance(TIMINGS.revealMs);
  }
  await stateWhere(a, 'итоги у Ильи', (v) => v.id === gameId && v.phase === 'finished' && v.result?.rating !== null);
  await stateWhere(b, 'итоги у Марка', (v) => v.id === gameId && v.phase === 'finished' && v.result?.rating !== null);
}

async function finishedDuel() {
  const w = await world();
  const a = await player(w, ilya);
  const b = await player(w, mark);
  const created = await a.socket.emitWithAck('game:create', { category: 'history' });
  if (!created.ok) throw new Error(created.error);
  const gameId = created.game.id;
  await b.socket.emitWithAck('game:join', { gameId });
  await a.socket.emitWithAck('game:ready', { gameId, ready: true });
  await b.socket.emitWithAck('game:ready', { gameId, ready: true });
  await playDuel(w, a, b, gameId);
  return { w, a, b, gameId };
}

describe('Этап 7: реванш с двумя настоящими клиентами', () => {
  it('предложил → соперник принял → оба сразу в отсчёте новой партии той же категории; её можно доиграть', async () => {
    const { w, a, b, gameId } = await finishedDuel();
    const result = lastOf(a, gameId)!;
    expect(result.result?.rating?.before).toBe(1000);
    expect(result.rematch).toMatchObject({ status: null, canOffer: true });

    const offered = await a.socket.emitWithAck('rematch:offer', { gameId });
    expect(offered.ok && offered.game.rematch).toMatchObject({ status: 'offered', byMe: true });
    const atB = await stateWhere(b, 'плашка у Марка', (v) => v.id === gameId && v.rematch?.status === 'offered');
    expect(atB.rematch).toMatchObject({ byMe: false, canOffer: true });
    expect(atB.rematch!.expiresAt! - w.clock.now()).toBeGreaterThan(TIMINGS.rematchMs - 1_000);

    await w.clock.advance(10_000);
    const accepted = await b.socket.emitWithAck('rematch:respond', { gameId, accept: true });
    expect(accepted.ok).toBe(true);

    const nextA = await stateWhere(a, 'новая партия у Ильи', (v) => v.rematchOf === gameId);
    const nextB = await stateWhere(b, 'новая партия у Марка', (v) => v.rematchOf === gameId);
    expect(nextA.id).toBe(nextB.id);
    expect(nextA).toMatchObject({ mode: 'rematch', category: 'history', phase: 'countdown' });
    expect(nextA.me.ready && nextA.opponent?.ready).toBe(true);
    // Рейтинг в карточках уже после первой партии.
    expect(nextA.me.rating).toBe(result.result!.rating!.after);
    expect((await stateWhere(a, 'пометка «принят»', (v) => v.id === gameId && v.rematch?.status === 'accepted')).rematch?.nextGameId).toBe(nextA.id);

    // После переподключения сервер возвращает игрока в новую партию.
    const sync = await a.socket.emitWithAck('game:sync', {});
    expect(sync.ok && sync.game?.id).toBe(nextA.id);

    await playDuel(w, a, b, nextA.id);
    expect(lastOf(a, nextA.id)!.result?.outcome).toBeDefined();
  }, 30_000);

  it('оба нажали «Реванш» одновременно - одна новая партия', async () => {
    const { w, a, b, gameId } = await finishedDuel();
    const [ra, rb] = await Promise.all([a.socket.emitWithAck('rematch:offer', { gameId }), b.socket.emitWithAck('rematch:offer', { gameId })]);
    expect(ra.ok && rb.ok).toBe(true);
    const nextA = await stateWhere(a, 'новая партия у Ильи', (v) => v.rematchOf === gameId);
    const nextB = await stateWhere(b, 'новая партия у Марка', (v) => v.rematchOf === gameId);
    expect(nextA.id).toBe(nextB.id);
    expect([...w.repo.rows.values()].filter((r) => r.state.rematchOf === gameId)).toHaveLength(1);
  }, 20_000);

  it('нет ответа 30 с - таймаут, согласие после него не принимается', async () => {
    const { w, a, b, gameId } = await finishedDuel();
    // Таймаут 30 с.
    await a.socket.emitWithAck('rematch:offer', { gameId });
    await w.clock.advance(TIMINGS.rematchMs);
    const expired = await stateWhere(a, 'таймаут', (v) => v.id === gameId && v.rematch?.status === 'expired');
    expect(expired.rematch).toMatchObject({ canOffer: false, blocked: 'closed' });
    expect(await b.socket.emitWithAck('rematch:respond', { gameId, accept: true })).toEqual({ ok: false, error: 'rematch_closed' });
  }, 20_000);

  it('соперник закрыл приложение на итогах - кнопка неактивна, предложение не уходит', async () => {
    const { a, b, gameId } = await finishedDuel();
    b.socket.disconnect();
    const gone = await stateWhere(a, 'соперник вышел', (v) => v.id === gameId && v.rematch?.blocked === 'opponentLeft');
    expect(gone.rematch?.canOffer).toBe(false);
    expect(await a.socket.emitWithAck('rematch:offer', { gameId })).toEqual({ ok: false, error: 'opponent_left' });
  }, 20_000);

  it('предложение висит, соперник ушёл на главную - «Соперник вышел»', async () => {
    const { a, b, gameId } = await finishedDuel();
    await a.socket.emitWithAck('rematch:offer', { gameId });
    expect((await b.socket.emitWithAck('game:leave', { gameId })).ok).toBe(true);
    const left = await stateWhere(a, 'ушёл', (v) => v.id === gameId && v.rematch?.status === 'left');
    expect(left.opponent?.left).toBe(true);
  }, 20_000);

  it('невалидные данные и посторонний отклоняются', async () => {
    const { a, gameId } = await finishedDuel();
    expect(await a.socket.emitWithAck('rematch:respond', { gameId, accept: 'yes' } as never)).toEqual({ ok: false, error: 'invalid' });
    expect(await a.socket.emitWithAck('rematch:offer', { gameId: 'bad' })).toEqual({ ok: false, error: 'invalid' });
    expect(await a.socket.emitWithAck('rematch:offer', { gameId: 'Zz00000000' })).toEqual({ ok: false, error: 'not_found' });
  }, 20_000);
});
