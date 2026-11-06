/**
 * Общий стенд для тестов этапа 8 с настоящими сокет-клиентами: сервер Socket.IO +
 * GameManager на «перематываемых» часах (JumpClock) и хранилищах в памяти.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  SOCKET_PATH,
  TIMINGS,
  type ClientToServerEvents,
  type GameCategory,
  type GameView,
  type ReactionEvent,
  type ServerToClientEvents,
  type SessionHello,
} from '@quiz-duel/shared';
import { attachSocket, socketNotifier, type IoServer } from '../src/socket.js';
import { GameManager, type ManagerDeps } from '../src/game/manager.js';
import { memoryGamesRepo } from '../src/game/repo.js';
import { loadQuestionBank } from '../src/questions/bank.js';
import type { TelegramUser } from '../src/auth/initData.js';
import { BOT_TOKEN, DOCS_VERSION, ilya, makeInitData, memoryUsers } from './helpers.js';
import { JumpClock } from './jumpClock.js';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const mark: TelegramUser = { id: 200300, first_name: 'Марк', username: 'mark_k', language_code: 'en' };
export const anya: TelegramUser = { id: 300400, first_name: 'Аня', language_code: 'ru' };
export { ilya };
export const bank = loadQuestionBank();
export const silentLog = { error() {}, warn() {}, info() {} } as never;

export interface World {
  clock: JumpClock;
  repo: ReturnType<typeof memoryGamesRepo>;
  users: ReturnType<typeof memoryUsers>;
  http: Server;
  io: IoServer;
  games: GameManager;
  port: number;
}

const worlds: World[] = [];
const clients: ClientSocket[] = [];

/** Сервер с тремя игроками (Илья, Марк, Аня), принявшими документы. extra - дополнительные зависимости менеджера. */
export async function world(extra: Partial<ManagerDeps> = {}): Promise<World> {
  const users = memoryUsers();
  for (const u of [ilya, mark, anya]) {
    await users.upsertFromTelegram(u);
    users.rows.get(u.id)!.docsVersion = DOCS_VERSION;
  }
  const clock = new JumpClock();
  const repo = memoryGamesRepo();
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
    ...extra,
  });
  io = attachSocket(http, { botToken: BOT_TOKEN, maxAgeSec: 86_400, origin: 'https://quiz.example.sslip.io', log: silentLog, games, now: clock.now });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const w: World = { clock, repo, users, http, io, games, port: (http.address() as AddressInfo).port };
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

export interface Player {
  user: TelegramUser;
  socket: ClientSocket;
  hello: SessionHello;
  states: GameView[];
  reactions: ReactionEvent[];
  /** Все остальные события сервера по имени (queue:*, …). */
  events: { name: string; data: unknown }[];
}

export function player(w: World, user: TelegramUser): Promise<Player> {
  const socket: ClientSocket = connect(`http://127.0.0.1:${w.port}`, {
    path: SOCKET_PATH,
    auth: { initData: makeInitData({ user }) },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  const p = { user, socket, states: [], reactions: [], events: [] } as unknown as Player;
  socket.on('game:state', (view) => p.states.push(view));
  socket.on('game:reaction', (event) => p.reactions.push(event));
  socket.onAny((name: string, data: unknown) => {
    if (name !== 'game:state' && name !== 'game:reaction') p.events.push({ name, data });
  });
  return new Promise((resolve, reject) => {
    socket.once('session:hello', (hello) => {
      p.hello = hello;
      resolve(p);
    });
    socket.once('connect_error', reject);
  });
}

export async function until<T>(fn: () => T | undefined | null | false, what: string, timeoutMs = 3_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`не дождались: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const stateWhere = (p: Player, what: string, pred: (v: GameView) => boolean) => until(() => p.states.find(pred), what);
export const lastOf = (p: Player, gameId: string) => p.states.filter((v) => v.id === gameId).at(-1);

/** Лобби: A создаёт, B входит по ссылке. */
export async function lobby(a: Player, b: Player, category: GameCategory = 'science') {
  const created = await a.socket.emitWithAck('game:create', { category });
  if (!created.ok) throw new Error(created.error);
  const gameId = created.game.id;
  const joined = await b.socket.emitWithAck('game:join', { gameId });
  if (!joined.ok) throw new Error(joined.error);
  return gameId;
}

/** «Готов» у обоих → отсчёт перемотан → первый вопрос у обоих. */
export async function start(w: World, a: Player, b: Player, gameId: string) {
  await a.socket.emitWithAck('game:ready', { gameId, ready: true });
  await b.socket.emitWithAck('game:ready', { gameId, ready: true });
  await w.clock.advance(TIMINGS.countdownMs);
  await stateWhere(a, 'вопрос 1 у A', (v) => v.id === gameId && v.phase === 'question');
  await stateWhere(b, 'вопрос 1 у B', (v) => v.id === gameId && v.phase === 'question');
}

/** Все 10 вопросов: оба отвечают сразу (A - первым вариантом, B - вторым), итоги посчитаны у обоих. */
export async function playOut(w: World, a: Player, b: Player, gameId: string) {
  for (let i = 0; i < 10; i++) {
    await stateWhere(a, `вопрос ${i + 1}`, (v) => v.id === gameId && v.phase === 'question' && v.question?.index === i);
    await a.socket.emitWithAck('game:answer', { gameId, questionIndex: i, optionIndex: 0 });
    await b.socket.emitWithAck('game:answer', { gameId, questionIndex: i, optionIndex: 1 });
    await stateWhere(a, `раскрытие ${i + 1}`, (v) => v.id === gameId && v.phase === 'reveal' && v.reveal?.index === i);
    await w.clock.advance(TIMINGS.revealMs);
  }
  await stateWhere(a, 'итоги у A', (v) => v.id === gameId && v.phase === 'finished' && v.result?.rating !== null);
  await stateWhere(b, 'итоги у B', (v) => v.id === gameId && v.phase === 'finished' && v.result?.rating !== null);
}
