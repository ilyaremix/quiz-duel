import { beforeAll, describe, expect, it, vi } from 'vitest';

/** Поддельный сокет: события сервера вызываем руками, запросы клиента записываем. */
class FakeSocket {
  connected = false;
  active = true;
  sent: { event: string; payload: unknown }[] = [];
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }
  timeout() {
    return {
      emitWithAck: async (event: string, payload?: unknown) => {
        this.sent.push({ event, payload });
        if (event === 'time:sync') return { serverNow: Date.now() };
        return { ok: false, error: 'not_found' };
      },
    };
  }
  connect() {
    this.active = true;
    return this;
  }
  disconnect() {
    this.connected = false;
    this.active = false;
    return this;
  }
}

const sockets: FakeSocket[] = [];
vi.mock('../src/lib/socket', () => ({
  createSocket: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  },
}));
vi.mock('../src/lib/telegram', () => ({
  haptic: { select() {}, tick() {}, success() {}, error() {}, win() {} },
  onResume: () => () => undefined,
  scrollToTop: () => undefined,
}));
vi.mock('@tma.js/sdk-react', () => ({ copyTextToClipboard: vi.fn(), openLink: vi.fn(), shareMessage: vi.fn(), shareURL: vi.fn() }));

let game: typeof import('../src/lib/game');
beforeAll(async () => {
  vi.stubGlobal('window', { addEventListener: () => undefined, setTimeout, clearTimeout });
  game = await import('../src/lib/game');
});

const hello = (s: FakeSocket) => {
  s.connected = true;
  s.fire('session:hello', { userId: 1, serverNow: Date.now(), currentGameId: null, resultsGameId: null });
};
const joins = (s: FakeSocket) => s.sent.filter((m) => m.event === 'game:join');
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('запуск: сокет открывается вместе с /api/me', () => {
  it('сокет создаётся сразу, а вход по ссылке ждёт ответа /api/me (новичка записывает в базу он)', async () => {
    game.gameActions.start('init-data', 'abc123', async () => undefined);
    const s = sockets[0]!;
    expect(sockets).toHaveLength(1);
    expect(game.useGame.getState().linkEntry).toBe(true);

    hello(s);
    await settle();
    expect(joins(s)).toEqual([]);

    game.gameActions.profileReady();
    await settle();
    expect(joins(s)).toEqual([{ event: 'game:join', payload: { gameId: 'abc123' } }]);

    // Повторный ответ /api/me и переподключение второй раз в ту же партию не ведут.
    game.gameActions.profileReady();
    hello(s);
    await settle();
    expect(joins(s)).toHaveLength(1);
    // Второй старт (StrictMode, повторный эффект) нового сокета не открывает.
    game.gameActions.start('init-data', null, async () => undefined);
    expect(sockets).toHaveLength(1);
  });

  it('заблокированному сокет закрывается насовсем', () => {
    const s = sockets[0]!;
    game.gameActions.stop();
    expect(s.connected).toBe(false);
    expect(s.active).toBe(false);
  });
});
