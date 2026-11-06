import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, SessionHello } from '@quiz-duel/shared';
import { SOCKET_PATH } from '@quiz-duel/shared';
import { attachSocket, type IoServer } from '../src/socket.js';
import { BOT_TOKEN, ilya, makeInitData } from './helpers.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const silentLog = { error() {}, warn() {}, info() {} } as never;
let http: Server | undefined;
let io: IoServer | undefined;
const clients: ClientSocket[] = [];

async function startServer() {
  http = createServer();
  io = attachSocket(http, { botToken: BOT_TOKEN, maxAgeSec: 86_400, origin: 'https://quiz.example.sslip.io', log: silentLog });
  await new Promise<void>((resolve) => http!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}

function client(url: string, initData: unknown): ClientSocket {
  const socket: ClientSocket = connect(url, {
    path: SOCKET_PATH,
    auth: { initData },
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(socket);
  return socket;
}

afterEach(async () => {
  clients.splice(0).forEach((socket) => socket.close());
  await new Promise<void>((resolve) => (io ? io.close(() => resolve()) : resolve()));
  io = undefined;
  http = undefined;
});

describe('Socket.IO: авторизация по initData', () => {
  it('верный initData - соединение и приветствие с userId', async () => {
    const url = await startServer();
    const socket = client(url, makeInitData());
    const hello = await new Promise<SessionHello>((resolve, reject) => {
      socket.on('session:hello', resolve);
      socket.on('connect_error', reject);
    });
    expect(hello.userId).toBe(ilya.id);
    expect(Math.abs(hello.serverNow - Date.now())).toBeLessThan(5_000);
  });

  it('time:sync отвечает временем сервера', async () => {
    const url = await startServer();
    const socket = client(url, makeInitData());
    await new Promise((resolve) => socket.on('session:hello', resolve));
    const ack = await socket.timeout(2_000).emitWithAck('time:sync');
    expect(typeof ack.serverNow).toBe('number');
  });

  it.each([
    ['без initData', undefined, { error: 'unauthorized' }],
    ['не строка', { user: 1 }, { error: 'unauthorized' }],
    ['чужой токен', makeInitData({ token: '1:AAH-some-other-bot-token-000000000' }), { error: 'invalid_init_data', reason: 'bad_hash' }],
    [
      'устаревший',
      makeInitData({ authDateSec: Math.floor(Date.now() / 1000) - 3 * 86_400 }),
      { error: 'invalid_init_data', reason: 'expired' },
    ],
  ])('%s - отказ при подключении', async (_name, initData, expected) => {
    const url = await startServer();
    const socket = client(url, initData);
    const error = await new Promise<Error & { data?: unknown }>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
    expect(error.data).toEqual(expected);
    expect(socket.connected).toBe(false);
  });
});
