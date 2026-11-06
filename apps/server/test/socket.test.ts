import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameView, ServerToClientEvents, SessionHello } from '@quiz-duel/shared';
import { SOCKET_PATH } from '@quiz-duel/shared';
import { attachSocket, socketNotifier, type IoServer } from '../src/socket.js';
import { GameManager } from '../src/game/manager.js';
import { memoryGamesRepo } from '../src/game/repo.js';
import { loadQuestionBank } from '../src/questions/bank.js';
import { BOT_TOKEN, DOCS_VERSION, ilya, makeInitData, memoryUsers } from './helpers.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const silentLog = { error() {}, warn() {}, info() {} } as never;
let http: Server | undefined;
let io: IoServer | undefined;
const clients: ClientSocket[] = [];
const stops: Array<() => void> = [];

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
  stops.splice(0).forEach((stop) => stop());
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

describe('Socket.IO: лобби с двумя настоящими клиентами', () => {
  const mark = { id: 200300, first_name: 'Марк', username: 'mark_k', language_code: 'en' };

  async function startGameServer() {
    const users = memoryUsers();
    for (const u of [ilya, mark]) {
      await users.upsertFromTelegram(u);
      users.rows.get(u.id)!.docsVersion = DOCS_VERSION;
    }
    http = createServer();
    const games = new GameManager({
      repo: memoryGamesRepo(),
      users,
      bank: loadQuestionBank(),
      notify: socketNotifier(() => io ?? null),
      appUrl: 'https://t.me/quiz_test_bot/play',
      docsVersion: DOCS_VERSION,
      log: silentLog,
    });
    stops.push(() => games.stop());
    io = attachSocket(http, { botToken: BOT_TOKEN, maxAgeSec: 86_400, origin: 'https://quiz.example.sslip.io', log: silentLog, games });
    await new Promise<void>((resolve) => http!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  }

  async function player(url: string, user: typeof ilya) {
    const socket = client(url, makeInitData({ user }));
    const hello = await new Promise<SessionHello>((resolve, reject) => {
      socket.once('session:hello', resolve);
      socket.once('connect_error', reject);
    });
    return { socket, hello };
  }

  const nextState = (socket: ClientSocket, phase: string) =>
    new Promise<GameView>((resolve) => {
      const onState = (view: GameView) => {
        if (view.phase !== phase) return;
        socket.off('game:state', onState);
        resolve(view);
      };
      socket.on('game:state', onState);
    });

  it('создание → вход по ссылке → «Готов» у обоих → отсчёт у обоих', async () => {
    const url = await startGameServer();
    const a = await player(url, ilya);
    expect(a.hello.currentGameId).toBeNull();
    const created = await a.socket.emitWithAck('game:create', { category: 'mix' });
    if (!created.ok) throw new Error(created.error);
    const gameId = created.game.id;

    const b = await player(url, mark);
    const lobbyForA = nextState(a.socket, 'lobby');
    const joined = await b.socket.emitWithAck('game:join', { gameId });
    expect(joined.ok && joined.game).toMatchObject({ phase: 'lobby', opponent: { userId: ilya.id, name: 'Илья' } });
    expect((await lobbyForA).opponent).toMatchObject({ userId: mark.id, name: 'Марк' });

    await a.socket.emitWithAck('game:ready', { gameId, ready: true });
    const countdownA = nextState(a.socket, 'countdown');
    const countdownB = nextState(b.socket, 'countdown');
    const ready = await b.socket.emitWithAck('game:ready', { gameId, ready: true });
    expect(ready.ok && ready.game.phase).toBe('countdown');
    const [ca, cb] = await Promise.all([countdownA, countdownB]);
    expect(ca.phaseEndsAt).toBe(cb.phaseEndsAt);

    // Переподключение возвращает в ту же партию даже без ссылки.
    a.socket.close();
    const again = await player(url, ilya);
    expect(again.hello.currentGameId).toBe(gameId);
  });

  it('партия: ответ, повтор после переподключения, раскрытие у обоих, сдача', async () => {
    const url = await startGameServer();
    let a = await player(url, ilya);
    const created = await a.socket.emitWithAck('game:create', { category: 'science' });
    if (!created.ok) throw new Error(created.error);
    const gameId = created.game.id;
    const b = await player(url, mark);
    await b.socket.emitWithAck('game:join', { gameId });
    await a.socket.emitWithAck('game:ready', { gameId, ready: true });
    const questionA = nextState(a.socket, 'question');
    const questionB = nextState(b.socket, 'question');
    await b.socket.emitWithAck('game:ready', { gameId, ready: true });
    const [qa, qb] = await Promise.all([questionA, questionB]);
    expect(qa.question?.questionId).toBe(qb.question?.questionId);
    expect(qa.question?.endsAt).toBe(qb.question?.endsAt);

    const first = await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 2 });
    expect(first.ok && first.accepted).toBe(true);

    // Свернул и вернулся: снимок помнит выбор, повтор ответа не принимается.
    a.socket.close();
    a = await player(url, ilya);
    expect(a.hello.currentGameId).toBe(gameId);
    const synced = await a.socket.emitWithAck('game:sync', { gameId });
    expect(synced.ok && synced.game).toMatchObject({ phase: 'question', myAnswer: { position: 2 } });
    const repeat = await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 1 });
    expect(repeat.ok && repeat.accepted).toBe(false);
    expect(await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 7 })).toEqual({ ok: false, error: 'invalid' });

    const revealA = nextState(a.socket, 'reveal');
    const revealB = nextState(b.socket, 'reveal');
    await b.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 });
    const [ra, rb] = await Promise.all([revealA, revealB]);
    expect(ra.reveal?.correctPosition).toBe(rb.reveal?.correctPosition);
    expect(ra.reveal?.me.position).toBe(2);
    expect(rb.reveal?.opponent?.position).toBe(2);

    const finishedB = nextState(b.socket, 'finished');
    const gave = await a.socket.emitWithAck('game:forfeit', { gameId });
    expect(gave.ok && gave.game.result).toMatchObject({ outcome: 'loss', technical: true, reason: 'forfeit' });
    expect((await finishedB).result).toMatchObject({ outcome: 'win', technical: true, leaverId: ilya.id });
  }, 20_000);

  it('невалидные данные события - отказ invalid, соединение живо', async () => {
    const url = await startGameServer();
    const a = await player(url, ilya);
    expect(await a.socket.emitWithAck('game:create', { category: 'politics' } as never)).toEqual({ ok: false, error: 'invalid' });
    expect(await a.socket.emitWithAck('game:join', { gameId: '../../etc' })).toEqual({ ok: false, error: 'invalid' });
    expect(await a.socket.emitWithAck('game:ready', { gameId: 'AAAAAAAAAA', ready: 'yes' } as never)).toEqual({ ok: false, error: 'invalid' });
    expect(a.socket.connected).toBe(true);
    const ack = await a.socket.timeout(2_000).emitWithAck('time:sync');
    expect(typeof ack.serverNow).toBe('number');
  });

  it('тот же игрок с другого устройства - прежнее подключение получает session:replaced', async () => {
    const url = await startGameServer();
    const first = await player(url, ilya);
    const replaced = new Promise<void>((resolve) => first.socket.once('session:replaced', () => resolve()));
    const disconnected = new Promise<void>((resolve) => first.socket.once('disconnect', () => resolve()));
    await player(url, ilya);
    await replaced;
    await disconnected;
    expect(first.socket.connected).toBe(false);
  });
});
