/**
 * Обновление 2.0: маршруты магазина. Игрок - только из initData, отказы - 409 с причиной,
 * мусор во входе - 400, без initData - 401. Счёт на звёзды - для своего игрока и с проверкой «Без рекламы».
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { WalletResponse } from '@quiz-duel/shared';
import { buildApp, type InvoiceMaker } from '../src/http/app.js';
import type { EconomyRepo } from '../src/economy.js';
import { invoicePayload, parsePayload } from '../src/bot/payments.js';
import { ilya, makeInitData, memoryUsers, testEnv } from './helpers.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const wallet = (patch: Partial<WalletResponse> = {}): WalletResponse => ({
  coins: 120,
  adFree: false,
  glow: 'none',
  pack: 'base',
  owned: { glow: ['none'], pack: ['base'], topic: [] },
  passes: [],
  daily: { day: 1, series: 0, claimed: false, reward: 10 },
  tasks: [],
  resetAt: 0,
  adDue: false,
  premium: false,
  ...patch,
});

function fakeEconomy(calls: string[]): EconomyRepo {
  return {
    ensureTasks: async () => undefined,
    taskConfigs: async () => [],
    wallet: async (userId) => (calls.push(`wallet:${userId}`), userId === ilya.id ? wallet() : wallet({ adFree: true })),
    claimDaily: async (userId) => (calls.push(`daily:${userId}`), { ok: true, wallet: wallet({ coins: 130 }), reward: 10 }),
    claimTask: async (_userId, id) => (id === 'play' ? { ok: false, error: 'not_ready' } : { ok: false, error: 'not_found' }),
    buy: async (_u, kind, item) => (calls.push(`buy:${kind}:${item}`), { ok: false, error: 'no_coins' }),
    equip: async () => ({ ok: true, wallet: wallet({ glow: 'neon' }) }),
    adStart: async () => ({ ok: true, id: 'abcdefgh12345678', sec: 15, src: '/ads/ad1.mp4' }),
    adDone: async () => ({ ok: false, error: 'too_early' }),
    gamePlayed: async () => undefined,
    grantPurchase: async () => true,
    revokePurchase: async () => true,
    looks: async () => new Map(),
    ownsPack: async () => true,
    ownedTopics: async () => [],
    topicAccess: async () => 'locked',
    useTopic: async () => false,
  };
}

async function makeApp() {
  const calls: string[] = [];
  const invoices: InvoiceMaker = {
    link: async ({ userId, product, lang }) => (calls.push(`invoice:${userId}:${product}:${lang}`), 'https://t.me/$invoice'),
  };
  const app = await buildApp({ env: testEnv(), users: memoryUsers(), economy: fakeEconomy(calls), invoices, botUsername: 'quizduel_test_bot', logger: false });
  apps.push(app);
  return { app, calls };
}

const auth = (user = ilya) => ({ authorization: `tma ${makeInitData({ user })}`, 'content-type': 'application/json' });

describe('маршруты магазина', () => {
  it('кошелёк и серия - только с initData', async () => {
    const { app, calls } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/wallet' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/api/wallet', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ coins: 120 });
    const daily = await app.inject({ method: 'POST', url: '/api/daily', headers: auth(), payload: '{}' });
    expect(daily.json()).toMatchObject({ reward: 10, wallet: { coins: 130 } });
    expect(calls).toEqual([`wallet:${ilya.id}`, `daily:${ilya.id}`]);
  });

  it('отказы - 409 с причиной, нет такого - 404, мусор - 400', async () => {
    const { app } = await makeApp();
    const buy = await app.inject({ method: 'POST', url: '/api/shop/buy', headers: auth(), payload: JSON.stringify({ kind: 'glow', item: 'neon' }) });
    expect(buy.statusCode).toBe(409);
    expect(buy.json()).toEqual({ error: 'conflict', reason: 'no_coins' });
    const task = await app.inject({ method: 'POST', url: '/api/tasks/claim', headers: auth(), payload: JSON.stringify({ id: 'zzz' }) });
    expect(task.statusCode).toBe(404);
    for (const [url, body] of [
      ['/api/shop/buy', { kind: 'car', item: 'neon' }],
      ['/api/shop/buy', { kind: 'glow', item: 'NEON!' }],
      ['/api/shop/equip', { kind: 'topic', item: 'space' }],
      ['/api/tasks/claim', { id: 'a b' }],
      ['/api/ads/start', { purpose: 'free-money' }],
      ['/api/ads/done', { id: '<script>' }],
      ['/api/stars/invoice', { product: 'coins_xl' }],
      ['/api/shop/buy', { kind: 'glow', item: 'neon', userId: 1 }],
    ] as const) {
      const res = await app.inject({ method: 'POST', url, headers: auth(), payload: JSON.stringify(body) });
      expect(res.statusCode, `${url} ${JSON.stringify(body)}`).toBe(400);
    }
  });

  it('реклама: старт выдаёт ролик, раннее «досмотрел» - too_early', async () => {
    const { app } = await makeApp();
    const start = await app.inject({ method: 'POST', url: '/api/ads/start', headers: auth(), payload: JSON.stringify({ purpose: 'reward' }) });
    expect(start.json()).toEqual({ id: 'abcdefgh12345678', sec: 15, src: '/ads/ad1.mp4' });
    const done = await app.inject({ method: 'POST', url: '/api/ads/done', headers: auth(), payload: JSON.stringify({ id: 'abcdefgh12345678' }) });
    expect(done.json()).toEqual({ error: 'conflict', reason: 'too_early' });
  });

  it('счёт на звёзды: свой игрок и язык; «Без рекламы» второй раз не продаётся', async () => {
    const { app, calls } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/stars/invoice', headers: auth(), payload: JSON.stringify({ product: 'coins_m' }) });
    expect(res.json()).toEqual({ url: 'https://t.me/$invoice' });
    expect(calls).toContain(`invoice:${ilya.id}:coins_m:ru`);
    const mark = { id: 777, first_name: 'Mark', language_code: 'en' };
    const again = await app.inject({ method: 'POST', url: '/api/stars/invoice', headers: auth(mark), payload: JSON.stringify({ product: 'adfree' }) });
    expect(again.json()).toEqual({ error: 'conflict', reason: 'owned' });
  });
});

describe('payload счёта', () => {
  it('туда и обратно; чужое и битое - null', () => {
    expect(parsePayload(invoicePayload('coins_l', 100500))).toEqual({ product: 'coins_l', userId: 100500 });
    expect(parsePayload('qd1:coins_xl:1')).toBeNull();
    expect(parsePayload('other:coins_s:1')).toBeNull();
    expect(parsePayload('qd1:adfree:')).toBeNull();
    expect(parsePayload('qd1:adfree:12a')).toBeNull();
  });
});
