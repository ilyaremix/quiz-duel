/**
 * Админка: маршруты только для ADMIN_IDS (остальным 403), события - только известные имена,
 * /api/me сообщает, админ ли игрок.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, EVENTS_LIMIT } from '../src/http/app.js';
import type { AdminRepo } from '../src/admin.js';
import type { EconomyRepo } from '../src/economy.js';
import type { FriendsRepo } from '../src/friends.js';
import type { TelegramUser } from '../src/auth/initData.js';
import { ilya, makeInitData, memoryUsers, testEnv } from './helpers.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp() {
  const tracked: string[][] = [];
  const admin = {
    touchDay: async () => undefined,
    track: async (_id: number, names: readonly string[]) => void tracked.push([...names]),
    overview: async (days: number) => ({ days }),
    isBanned: async () => false,
    checkChannel: async (ch: string) => ch === '@aid_crypto',
    createLink: async (code: string) => `https://t.me/quizduel_test_bot/app?startapp=src_${code}`,
  } as unknown as AdminRepo;
  const app = await buildApp({ env: testEnv(), users: memoryUsers(), admin, adminIds: new Set([ilya.id]), botUsername: 'quizduel_test_bot', logger: false });
  apps.push(app);
  return { app, tracked };
}

const mark = { id: 777, first_name: 'Mark', language_code: 'en' };
const auth = (user = ilya) => ({ authorization: `tma ${makeInitData({ user })}`, 'content-type': 'application/json' });

describe('админка', () => {
  it('только админы; период 7/30/90, остальное - 30', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/admin/overview' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/overview', headers: auth(mark) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/overview?days=7', headers: auth() })).json()).toEqual({ days: 7 });
    expect((await app.inject({ method: 'GET', url: '/api/admin/overview?days=5', headers: auth() })).json()).toEqual({ days: 30 });
  });

  it('проверка канала: имя канала по правилам Telegram', async () => {
    const { app } = await makeApp();
    const check = (channel: string) => app.inject({ method: 'POST', url: '/api/admin/channel', headers: auth(), payload: JSON.stringify({ channel }) });
    expect((await check('@aid_crypto')).json()).toEqual({ botAdmin: true });
    expect((await check('@other_channel')).json()).toEqual({ botAdmin: false });
    expect((await check('aid crypto')).statusCode).toBe(400);
  });

  it('ссылки: своя метка - да, занятая сервером (ref, duel…) - 400', async () => {
    const { app } = await makeApp();
    const link = (code: string) => app.inject({ method: 'POST', url: '/api/admin/links', headers: auth(), payload: JSON.stringify({ code, title: 'Пост' }) });
    expect((await link('aid1107')).json()).toEqual({ url: 'https://t.me/quizduel_test_bot/app?startapp=src_aid1107' });
    expect((await link('ref')).statusCode).toBe(400);
    expect((await link('Bad-Code')).statusCode).toBe(400);
  });

  it('/api/me: admin только у админа', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth() })).json()).toMatchObject({ admin: true, banned: false });
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth(mark) })).json()).toMatchObject({ admin: false });
  });

  it('события: известные имена пачкой, чужие - 400', async () => {
    const { app, tracked } = await makeApp();
    const ok = await app.inject({ method: 'POST', url: '/api/events', headers: auth(mark), payload: JSON.stringify({ events: ['home', 'quick'] }) });
    expect(ok.statusCode).toBe(200);
    expect(tracked).toEqual([['home', 'quick']]);
    const bad = await app.inject({ method: 'POST', url: '/api/events', headers: auth(mark), payload: JSON.stringify({ events: ['drop table'] }) });
    expect(bad.statusCode).toBe(400);
  });
});

describe('бан', () => {
  // Заблокирован Марк; Илья - обычный игрок.
  async function bannedApp() {
    const calls: string[] = [];
    const admin = {
      touchDay: async () => undefined,
      track: async () => void calls.push('track'),
      isBanned: async (id: number) => id === mark.id,
    } as unknown as AdminRepo;
    const reward = { ok: true as const, wallet: {} as never, reward: 10 };
    const economy = {
      claimDaily: async (id: number) => (calls.push(`daily:${id}`), reward),
      buy: async (id: number) => (calls.push(`buy:${id}`), { ok: true as const, wallet: {} as never }),
    } as unknown as EconomyRepo;
    const friends = {
      request: async (id: number) => (calls.push(`friend:${id}`), 'sent' as const),
      attribute: async () => ({ inviterId: null }),
    } as unknown as FriendsRepo;
    const app = await buildApp({ env: testEnv(), users: memoryUsers(), admin, economy, friends, botUsername: 'quizduel_test_bot', logger: false });
    apps.push(app);
    return { app, calls };
  }

  it('заблокированному - 403 на награды, покупки, друзей и аналитику, как ни пиши адрес', async () => {
    const { app, calls } = await bannedApp();
    const post = (url: string, body: unknown = {}, user: TelegramUser = mark) => app.inject({ method: 'POST', url, headers: auth(user), payload: JSON.stringify(body) });
    // «?x» и %64 (= «d») раньше проходили мимо проверки по адресу.
    for (const url of ['/api/daily', '/api/daily?x', '/api/%64aily', '/api/daily?a=1&b=2']) {
      expect((await post(url)).statusCode, url).toBe(403);
    }
    expect((await post('/api/shop/buy?x', { kind: 'glow', item: 'neon' })).statusCode).toBe(403);
    expect((await post('/api/friends/request?x', { id: ilya.id })).statusCode).toBe(403);
    expect((await post('/api/events?x', { events: ['home'] })).statusCode).toBe(403);
    expect(calls).toEqual([]);
    // Обычный игрок - как раньше.
    expect((await post('/api/daily?x', {}, ilya)).statusCode).toBe(200);
    expect(calls).toEqual([`daily:${ilya.id}`]);
  });
});

describe('аналитика: лимит событий', () => {
  it(`не больше ${EVENTS_LIMIT.max} событий в минуту от игрока, дальше 429`, async () => {
    const { app, tracked } = await makeApp();
    const batch = Array.from({ length: 50 }, () => 'home');
    const send = () => app.inject({ method: 'POST', url: '/api/events', headers: auth(mark), payload: JSON.stringify({ events: batch }) });
    for (let i = 0; i < EVENTS_LIMIT.max / 50; i++) expect((await send()).statusCode).toBe(200);
    const over = await send();
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: 'rate_limited' });
    expect(tracked.length).toBe(EVENTS_LIMIT.max / 50);
    // У другого игрока свой счёт.
    const own = await app.inject({ method: 'POST', url: '/api/events', headers: auth(), payload: JSON.stringify({ events: ['home'] }) });
    expect(own.statusCode).toBe(200);
  });
});
