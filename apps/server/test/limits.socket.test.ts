/**
 * Лимиты сокета: события считаются на игрока (переподключение их не сбрасывает),
 * подключаться можно не чаще CONNECT_LIMIT. Лимиты - настоящие, по умолчанию.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@quiz-duel/shared';
import { attachSocket, CONNECT_LIMIT, EVENT_LIMIT, socketNotifier, type IoServer } from '../src/socket.js';
import { GameManager } from '../src/game/manager.js';
import { memoryGamesRepo } from '../src/game/repo.js';
import { loadQuestionBank } from '../src/questions/bank.js';
import { BOT_TOKEN, DOCS_VERSION, ilya, makeInitData, memoryUsers } from './helpers.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const silentLog = { error() {}, warn() {}, info() {} } as never;
const mark = { id: 200300, first_name: 'Марк', language_code: 'en' };
const bank = loadQuestionBank();

let http: Server | undefined;
let io: IoServer | undefined;
let games: GameManager | undefined;
const clients: ClientSocket[] = [];

async function startServer() {
  const users = memoryUsers();
  for (const u of [ilya, mark]) {
    await users.upsertFromTelegram(u);
    users.rows.get(u.id)!.docsVersion = DOCS_VERSION;
  }
  http = createServer();
  let server: IoServer | null = null;
  games = new GameManager({
    repo: memoryGamesRepo(),
    users,
    bank,
    notify: socketNotifier(() => server),
    appUrl: 'https://t.me/quiz_test_bot/play',
    docsVersion: DOCS_VERSION,
    log: silentLog,
  });
  server = attachSocket(http, { botToken: BOT_TOKEN, maxAgeSec: 86_400, origin: 'https://quiz.example.sslip.io', log: silentLog, games });
  io = server;
  await new Promise<void>((resolve) => http!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}

/** Подключение: hello - вошли, иначе - ошибка от сервера. */
function join(url: string, user = ilya): Promise<{ socket: ClientSocket; error: (Error & { data?: unknown }) | null }> {
  const socket: ClientSocket = connect(url, {
    path: SOCKET_PATH,
    auth: { initData: makeInitData({ user }) },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  return new Promise((resolve) => {
    socket.once('session:hello', () => resolve({ socket, error: null }));
    socket.once('connect_error', (error) => resolve({ socket, error }));
  });
}

async function burst(socket: ClientSocket, n: number) {
  const results = await Promise.all(Array.from({ length: n }, () => socket.emitWithAck('game:sync', {})));
  return { ok: results.filter((r) => r.ok).length, limited: results.filter((r) => !r.ok && r.error === 'rate_limited').length };
}

afterEach(async () => {
  clients.splice(0).forEach((socket) => socket.close());
  await games?.shutdown();
  await new Promise<void>((resolve) => (io ? io.close(() => resolve()) : resolve()));
  io = undefined;
  http = undefined;
});

describe('Socket.IO: лимиты', () => {
  it('события считаются на игрока: переподключение не даёт новых 30', async () => {
    const url = await startServer();
    const first = await join(url);
    expect(await burst(first.socket, EVENT_LIMIT.max + 5)).toEqual({ ok: EVENT_LIMIT.max, limited: 5 });
    first.socket.close();
    // Раньше окно было на подключение - новое подключение снова давало 30 событий.
    const again = await join(url);
    expect(again.error).toBeNull();
    expect(await burst(again.socket, 5)).toEqual({ ok: 0, limited: 5 });
    // Другого игрока лимит Ильи не касается.
    const other = await join(url, mark);
    expect(await burst(other.socket, 5)).toEqual({ ok: 5, limited: 0 });
  });

  it(`подключиться можно не чаще ${CONNECT_LIMIT.max} раз в минуту - дальше отказ rate_limited`, async () => {
    const url = await startServer();
    for (let i = 0; i < CONNECT_LIMIT.max; i++) {
      const { socket, error } = await join(url);
      expect(error, `подключение ${i + 1}`).toBeNull();
      socket.close();
    }
    const refused = await join(url);
    expect(refused.error?.message).toBe('rate_limited');
    expect(refused.error?.data).toEqual({ error: 'rate_limited' });
    // Другой игрок подключается как обычно.
    expect((await join(url, mark)).error).toBeNull();
  });
});
