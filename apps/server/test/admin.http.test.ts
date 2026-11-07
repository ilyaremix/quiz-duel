/**
 * Админка: маршруты только для ADMIN_IDS (остальным 403), события - только известные имена,
 * /api/me сообщает, админ ли игрок.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/http/app.js';
import type { AdminRepo } from '../src/admin.js';
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
