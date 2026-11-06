/**
 * Этап 6: надёжность с двумя настоящими сокет-клиентами (socket.io-client) против
 * настоящего сервера (Socket.IO + GameManager). Время сервера идёт по JumpClock:
 * 30 с ожидания перематываются мгновенно, сокеты работают на настоящих таймерах.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  measureClockOffset,
  pointsFor,
  SOCKET_PATH,
  TIMINGS,
  type ClientToServerEvents,
  type GameView,
  type ServerToClientEvents,
  type SessionHello,
} from '@quiz-duel/shared';
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

// ---------------------------------------------------------------------------
// Сервер, который можно остановить и поднять заново на том же порту и с той же «базой»

interface World {
  clock: JumpClock;
  repo: ReturnType<typeof memoryGamesRepo>;
  users: ReturnType<typeof memoryUsers>;
  port: number;
  server: Instance | null;
}

interface Instance {
  http: Server;
  io: IoServer;
  games: GameManager;
}

const worlds: World[] = [];
const clients: ClientSocket[] = [];

async function world(): Promise<World> {
  const users = memoryUsers();
  for (const u of [ilya, mark]) {
    await users.upsertFromTelegram(u);
    users.rows.get(u.id)!.docsVersion = DOCS_VERSION;
  }
  const w: World = { clock: new JumpClock(), repo: memoryGamesRepo(), users, port: 0, server: null };
  worlds.push(w);
  await startServer(w);
  return w;
}

async function startServer(w: World) {
  const http = createServer();
  let io: IoServer | null = null;
  const games = new GameManager({
    repo: w.repo,
    users: w.users,
    bank,
    notify: socketNotifier(() => io),
    appUrl: 'https://t.me/quiz_test_bot/play',
    docsVersion: DOCS_VERSION,
    log: silentLog,
    clock: w.clock,
  });
  await games.restore();
  io = attachSocket(http, {
    botToken: BOT_TOKEN,
    maxAgeSec: 86_400,
    origin: 'https://quiz.example.sslip.io',
    log: silentLog,
    games,
    now: w.clock.now,
  });
  await new Promise<void>((resolve) => http.listen(w.port, '127.0.0.1', resolve));
  w.port = (http.address() as AddressInfo).port;
  w.server = { http, io, games };
}

/** Остановка, как по SIGTERM при выкатке: сначала партии, потом сокеты. */
async function stopServer(w: World) {
  const s = w.server;
  if (!s) return;
  w.server = null;
  await s.games.shutdown();
  await new Promise<void>((resolve) => s.io.close(() => resolve()));
}

afterEach(async () => {
  clients.splice(0).forEach((socket) => socket.close());
  for (const w of worlds.splice(0)) {
    await stopServer(w);
    w.clock.dispose();
  }
});

// ---------------------------------------------------------------------------
// Игрок: настоящий клиент + журнал всего, что ему пришло

interface Player {
  socket: ClientSocket;
  hellos: SessionHello[];
  states: GameView[];
  replaced: number;
}

function player(w: World, user: TelegramUser, options: { reconnect?: boolean } = {}): Promise<Player> {
  const socket: ClientSocket = connect(`http://127.0.0.1:${w.port}`, {
    path: SOCKET_PATH,
    auth: { initData: makeInitData({ user }) },
    transports: ['websocket'],
    reconnection: options.reconnect ?? false,
    reconnectionDelay: 100,
    reconnectionDelayMax: 200,
    forceNew: true,
  });
  clients.push(socket);
  const p: Player = { socket, hellos: [], states: [], replaced: 0 };
  socket.on('game:state', (view) => p.states.push(view));
  socket.on('session:replaced', () => (p.replaced += 1));
  return new Promise((resolve, reject) => {
    socket.on('session:hello', (hello) => {
      p.hellos.push(hello);
      if (p.hellos.length === 1) resolve(p);
    });
    socket.once('connect_error', reject);
  });
}

/** Ждём, пока условие станет верным (опрос каждые 10 мс). */
async function until<T>(fn: () => T | undefined | null | false, what: string, timeoutMs = 3_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`не дождались: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const last = (p: Player) => p.states.at(-1);
const stateWhere = (p: Player, what: string, pred: (v: GameView) => boolean, from = 0) =>
  until(() => p.states.slice(from).find(pred), what);

async function sync(p: Player, gameId?: string): Promise<GameView> {
  const res = await p.socket.emitWithAck('game:sync', gameId ? { gameId } : {});
  if (!res.ok || !res.game) throw new Error(`sync: ${res.ok ? 'нет партии' : res.error}`);
  return res.game;
}

/** Лобби → «Готов» у обоих → отсчёт перемотан → у обоих первый вопрос. */
async function startDuel(w: World, a: Player, b: Player) {
  const created = await a.socket.emitWithAck('game:create', { category: 'science' });
  if (!created.ok) throw new Error(created.error);
  const gameId = created.game.id;
  const joined = await b.socket.emitWithAck('game:join', { gameId });
  if (!joined.ok) throw new Error(joined.error);
  await a.socket.emitWithAck('game:ready', { gameId, ready: true });
  await b.socket.emitWithAck('game:ready', { gameId, ready: true });
  await w.clock.advance(TIMINGS.countdownMs);
  const qa = await stateWhere(a, 'вопрос 1 у A', (v) => v.phase === 'question');
  const qb = await stateWhere(b, 'вопрос 1 у B', (v) => v.phase === 'question');
  return { gameId, qa, qb };
}

const near = (value: number, expected: number, tolerance = 400) => {
  expect(value).toBeGreaterThanOrEqual(expected - tolerance);
  expect(value).toBeLessThanOrEqual(expected + tolerance);
};

// ---------------------------------------------------------------------------

describe('Этап 6: надёжность с двумя настоящими клиентами', () => {
  it('отключение и возврат посреди вопроса: снимок с остатком таймера, отсчёт у соперника сбрасывается', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const { gameId, qa } = await startDuel(w, a, b);

    await w.clock.advance(4_000);
    a.socket.disconnect(); // приложение выгружено из памяти
    const offline = await stateWhere(b, 'соперник офлайн', (v) => v.opponent?.online === false);
    near(offline.opponent!.graceEndsAt! - w.clock.now(), TIMINGS.reconnectGraceMs);
    expect(offline.phase).toBe('question');

    await w.clock.advance(5_000);
    const a2 = await player(w, ilya);
    expect(a2.hellos[0]!.currentGameId).toBe(gameId); // вернулся в партию без ссылки
    const back = await sync(a2);
    expect(back).toMatchObject({ phase: 'question', question: { index: 0, questionId: qa.question!.questionId } });
    expect(back.question!.endsAt).toBe(qa.question!.endsAt);
    near(back.question!.endsAt - back.serverNow, TIMINGS.questionMs - 9_000);

    const online = await stateWhere(b, 'соперник снова в сети', (v) => v.opponent?.online === true && v.rev > offline.rev);
    expect(online.opponent!.graceEndsAt).toBeNull();

    const answered = await a2.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 1 });
    expect(answered.ok && answered.accepted).toBe(true);
    // 30 с с момента ухода прошли - технической победы нет, игрок вернулся вовремя.
    await w.clock.advance(TIMINGS.reconnectGraceMs);
    expect(b.states.some((v) => v.phase === 'finished' && v.result?.technical)).toBe(false);
  }, 15_000);

  it('соперник не вернулся за 30 с - техническая победа; партия до этого идёт по таймерам', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const { gameId } = await startDuel(w, a, b);

    b.socket.disconnect();
    await stateWhere(a, 'соперник офлайн', (v) => v.opponent?.online === false);

    await w.clock.advance(TIMINGS.reconnectGraceMs - 1_000);
    const before = last(a)!;
    expect(before.phase).not.toBe('finished');
    // Первый вопрос за это время закрылся без ответа соперника, идёт следующий.
    expect(before.question!.index).toBeGreaterThan(0);
    expect(before.opponent).toMatchObject({ online: false });

    await w.clock.advance(1_500);
    const won = await stateWhere(a, 'итоги', (v) => v.phase === 'finished');
    expect(won.result).toMatchObject({ outcome: 'win', technical: true, reason: 'abandoned', leaverId: mark.id });

    // Вернулся поздно: партии уже нет в «текущих», по ссылке - его техническое поражение.
    const b2 = await player(w, mark);
    expect(b2.hellos[0]!.currentGameId).toBeNull();
    const lost = await sync(b2, gameId);
    expect(lost.result).toMatchObject({ outcome: 'loss', technical: true, reason: 'abandoned' });
  }, 15_000);

  it('«Игра открыта на другом устройстве» посреди партии: соперник не видит ухода, ответ сохранён', async () => {
    const w = await world();
    const phone = await player(w, ilya);
    const b = await player(w, mark);
    const { gameId } = await startDuel(w, phone, b);
    await w.clock.advance(2_000);
    const answered = await phone.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 3 });
    expect(answered.ok && answered.accepted).toBe(true);
    const seenByB = b.states.length;

    const desktop = await player(w, ilya);
    await until(() => phone.replaced === 1 && !phone.socket.connected, 'телефон получил session:replaced');
    expect(phone.socket.active).toBe(false); // сам не переподключается и не отбирает партию обратно
    expect(desktop.hellos[0]!.currentGameId).toBe(gameId);
    expect(await sync(desktop)).toMatchObject({ phase: 'question', myAnswer: { position: 3 } });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(b.states.slice(seenByB).some((v) => v.opponent?.online === false)).toBe(false);

    // «Играть здесь» на телефоне - теперь уже компьютер получает session:replaced.
    const helloAgain = new Promise<SessionHello>((resolve) => phone.socket.once('session:hello', resolve));
    phone.socket.connect();
    expect((await helloAgain).currentGameId).toBe(gameId);
    await until(() => desktop.replaced === 1 && !desktop.socket.connected, 'компьютер получил session:replaced');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(b.states.slice(seenByB).some((v) => v.opponent?.online === false)).toBe(false);
  }, 15_000);

  it('перезапуск сервера посреди вопроса: клиенты сами возвращаются, дедлайн и ответ те же', async () => {
    const w = await world();
    const a = await player(w, ilya, { reconnect: true });
    const b = await player(w, mark, { reconnect: true });
    const { gameId, qa } = await startDuel(w, a, b);
    await w.clock.advance(2_000);
    const first = await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 });
    expect(first.ok && first.accepted).toBe(true);

    await stopServer(w);
    await until(() => !a.socket.connected && !b.socket.connected, 'клиенты заметили остановку');
    await w.clock.advance(1_000);
    await startServer(w);

    // Socket.IO-клиенты переподключаются сами; приветствие сразу называет партию.
    await until(() => a.hellos.length === 2 && b.hellos.length === 2, 'клиенты переподключились', 5_000);
    expect(a.hellos[1]!.currentGameId).toBe(gameId);
    expect(b.hellos[1]!.currentGameId).toBe(gameId);

    const sa = await sync(a);
    const sb = await sync(b);
    expect(sa).toMatchObject({ phase: 'question', myAnswer: { position: 0 }, question: { index: 0, endsAt: qa.question!.endsAt } });
    expect(sb).toMatchObject({ phase: 'question', myAnswer: null, opponentAnswered: true });
    // Оба на связи: ни у кого нет отсчёта до технического поражения.
    expect(sa.opponent).toMatchObject({ online: true, graceEndsAt: null });
    expect(sb.opponent).toMatchObject({ online: true, graceEndsAt: null });

    const repeat = await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 2 });
    expect(repeat.ok && repeat.accepted).toBe(false);
    const from = a.states.length;
    await b.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 1 });
    const reveal = await stateWhere(a, 'раскрытие', (v) => v.phase === 'reveal', from);
    expect(reveal.reveal!.me.position).toBe(0);
    near(reveal.reveal!.me.timeMs!, 2_000, 300);
    const correct = reveal.reveal!.correctPosition === 0;
    expect(reveal.reveal!.me.points).toBe(pointsFor(correct, reveal.reveal!.me.timeMs!));
  }, 20_000);

  it('долгий перезапуск (40 с): просроченные вопросы закрыты, ложной технической победы нет', async () => {
    const w = await world();
    const a = await player(w, ilya, { reconnect: true });
    const b = await player(w, mark, { reconnect: true });
    const { gameId } = await startDuel(w, a, b);
    await w.clock.advance(1_000);

    await stopServer(w);
    await until(() => !a.socket.connected && !b.socket.connected, 'клиенты заметили остановку');
    // При остановке сервер ничего не записал про уход игроков.
    for (const p of [w.repo.rows.get(gameId)!.state.creator, w.repo.rows.get(gameId)!.state.opponent!]) {
      expect(p).toMatchObject({ online: true, graceEndsAt: null });
    }
    await w.clock.advance(40_000);
    await startServer(w);
    await until(() => a.hellos.length === 2 && b.hellos.length === 2, 'клиенты переподключились', 5_000);

    const sa = await sync(a);
    expect(sa.phase).not.toBe('finished');
    // 40 с простоя = вопросы 1-2 закрыты «время вышло», идёт 3-й (или раскрытие 2-го).
    expect(sa.question!.index).toBeGreaterThanOrEqual(1);
    expect(sa.opponent).toMatchObject({ online: true, graceEndsAt: null });
    await w.clock.advance(TIMINGS.reconnectGraceMs);
    expect([...a.states, ...b.states].some((v) => v.result?.technical)).toBe(false);
  }, 20_000);

  it('двойная отправка ответа после реконнекта: засчитан первый, повтор и другой вариант игнорируются', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const { gameId } = await startDuel(w, a, b);
    await w.clock.advance(3_000);

    // Ответ дошёл до сервера, а подтверждение клиент не получил: связь оборвалась сразу после.
    a.socket.emit('game:answer', { gameId, questionIndex: 0, optionIndex: 2 }, () => undefined);
    await stateWhere(b, 'соперник ответил', (v) => v.opponentAnswered);
    a.socket.disconnect();

    // Клиент после переподключения отправляет тот же ответ ещё раз, а потом (ошибка UI) другой.
    const a2 = await player(w, ilya);
    const again = await a2.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 2 });
    expect(again).toMatchObject({ ok: true, accepted: false, game: { myAnswer: { position: 2 } } });
    const other = await a2.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 1 });
    expect(other).toMatchObject({ ok: true, accepted: false, game: { myAnswer: { position: 2 } } });
    // Двойной тап: два события подряд - тоже один ответ.
    const [t1, t2] = await Promise.all([
      a2.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 }),
      a2.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 }),
    ]);
    expect([t1, t2].map((r) => r.ok && r.accepted)).toEqual([false, false]);

    const from = b.states.length;
    await b.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 3 });
    const reveal = await stateWhere(b, 'раскрытие', (v) => v.phase === 'reveal', from);
    expect(reveal.reveal!.opponent!.position).toBe(2);
    near(reveal.reveal!.opponent!.timeMs!, 3_000, 300);
    expect(w.repo.rows.get(gameId)!.state.creator.answers[0]).toMatchObject({ position: 2 });
  }, 15_000);

  it('ответ, отправленный во время обрыва, доходит после переподключения и считается по времени прихода', async () => {
    const w = await world();
    const a = await player(w, ilya, { reconnect: true });
    const b = await player(w, mark);
    const { gameId } = await startDuel(w, a, b);
    await w.clock.advance(2_000);

    a.socket.io.engine.close(); // сеть пропала: клиент сам начинает переподключаться
    await until(() => !a.socket.connected, 'обрыв');
    // Пока связи нет, Socket.IO-клиент держит событие в буфере и отправит его после возврата.
    const ack = a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 1 });
    await w.clock.advance(1_000);
    const res = await ack;
    expect(res.ok && res.accepted).toBe(true);
    expect(a.hellos.length).toBe(2);
    expect(w.repo.rows.get(gameId)!.state.creator.answers[0]!.timeMs).toBeGreaterThanOrEqual(3_000);
  }, 15_000);

  it('сбитые часы на телефоне: таймер верный по смещению, время ответа считает сервер', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const { gameId, qa } = await startDuel(w, a, b);

    for (const skew of [-7 * 60_000, 3 * 60 * 60_000]) {
      const phoneNow = () => Date.now() + skew; // часы телефона отстают на 7 минут / спешат на 3 часа
      const { offset } = await measureClockOffset(a.socket, { now: phoneNow });
      near(phoneNow() + offset, w.clock.now(), 100);
      // Остаток таймера по исправленным часам - как у сервера; по сырым часам телефона был бы мусор.
      near(qa.question!.endsAt - (phoneNow() + offset), qa.question!.endsAt - w.clock.now(), 100);
      expect(Math.abs(qa.question!.endsAt - phoneNow())).toBeGreaterThan(60_000);
    }

    await w.clock.advance(5_000);
    // Своё время клиент прислать не может: событие с лишним полем отклоняется схемой.
    const forged = await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0, timeMs: 1 } as never);
    expect(forged).toEqual({ ok: false, error: 'invalid' });
    const res = await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 });
    expect(res.ok && res.accepted).toBe(true);
    const answer = w.repo.rows.get(gameId)!.state.creator.answers[0]!;
    near(answer.timeMs, 5_000, 300);
    expect(answer.points).toBe(pointsFor(answer.correct, answer.timeMs));
  }, 15_000);
});
