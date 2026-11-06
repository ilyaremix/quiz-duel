import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/http/app.js';
import { ilya, makeInitData, memoryUsers, testEnv } from './helpers.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

async function makeApp() {
  const users = memoryUsers();
  const app = await buildApp({ env: testEnv(), users, botUsername: 'quizduel_test_bot', logger: false });
  apps.push(app);
  return { app, users };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('GET /api/me', () => {
  it('без заголовка - 401 unauthorized', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('с поддельным initData - 401 и причина', async () => {
    const { app } = await makeApp();
    const raw = makeInitData({ token: '1:AAH-some-other-bot-token-000000000' });
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${raw}` } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_init_data', reason: 'bad_hash' });
  });

  it('с устаревшим initData - 401 expired', async () => {
    const { app } = await makeApp();
    const raw = makeInitData({ authDateSec: Math.floor(Date.now() / 1000) - 2 * 86_400 });
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${raw}` } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ reason: 'expired' });
  });

  it('с верным initData создаёт игрока и отдаёт профиль', async () => {
    const { app, users } = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `tma ${makeInitData()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: ilya.id,
      firstName: 'Илья',
      username: 'ilya',
      language: 'auto',
      lang: 'ru',
      rating: 1000,
      games: 0,
    });
    expect(Math.abs(body.serverNow - Date.now())).toBeLessThan(5_000);
    expect(users.rows.size).toBe(1);
  });

  it('id игрока берётся только из подписанных данных', async () => {
    const { app, users } = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/me?userId=1',
      headers: { authorization: `tma ${makeInitData()}`, 'x-user-id': '1' },
    });
    expect(res.json().id).toBe(ilya.id);
    expect([...users.rows.keys()]).toEqual([ilya.id]);
  });

  it('англоязычный игрок получает lang en', async () => {
    const { app } = await makeApp();
    const raw = makeInitData({ user: { id: 7, first_name: 'Mark', language_code: 'en' } });
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${raw}` } });
    expect(res.json()).toMatchObject({ id: 7, lang: 'en', username: null, photoUrl: null });
  });
});

describe('публичные маршруты', () => {
  it('GET /api/health', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: true });
  });

  it('GET /api/config отдаёт ссылку на мини-апп', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json()).toEqual({
      botUsername: 'quizduel_test_bot',
      appShortName: 'play',
      appUrl: 'https://t.me/quizduel_test_bot/play',
    });
  });

  it('неизвестный путь - 404 not_found', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('CORS открыт только для домена мини-аппа', async () => {
    const { app } = await makeApp();
    const ok = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { origin: 'https://quiz.example.sslip.io' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe('https://quiz.example.sslip.io');
    const evil = await app.inject({ method: 'GET', url: '/api/config', headers: { origin: 'https://evil.example' } });
    // Чужой origin не отражается в ответе, поэтому браузер заблокирует чтение.
    expect(evil.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});
