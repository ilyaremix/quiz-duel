import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lastBackupAt } from '../src/backup.js';
import { buildApp } from '../src/http/app.js';
import type { StatsRepo } from '../src/stats.js';
import { DOCS_VERSION, ilya, makeInitData, memoryUsers, testEnv } from './helpers.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

async function makeApp(extra: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const users = memoryUsers();
  const app = await buildApp({ env: testEnv(), users, botUsername: 'quizduel_test_bot', logger: false, ...extra });
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
      docsAccepted: false,
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
    // Без бота (тесты, локальная вёрстка) - «off».
    expect(res.json()).toMatchObject({ ok: true, db: true, bot: 'off', botUpdateAgoSec: null });
  });

  it('GET /api/health показывает, жив ли опрос Telegram', async () => {
    const at = Date.now() - 42_000;
    const { app } = await makeApp({ botStatus: () => ({ state: 'polling', restarts: 1, lastUpdateAt: at }) });
    const body = (await app.inject({ method: 'GET', url: '/api/health' })).json();
    expect(body).toMatchObject({ ok: true, bot: 'polling', botRestarts: 1 });
    expect(body.botUpdateAgoSec).toBeGreaterThanOrEqual(41);
  });

  it('GET /api/health: возраст последней резервной копии базы (без копий - null, на ok не влияет)', async () => {
    const at = Date.now() - 3_600_000;
    const withBackup = await makeApp({ backupStatus: async () => at });
    const body = (await withBackup.app.inject({ method: 'GET', url: '/api/health' })).json();
    expect(body.ok).toBe(true);
    expect(body.backupAgoSec).toBeGreaterThanOrEqual(3599);
    expect(body.backupAgoSec).toBeLessThan(3700);

    const none = await makeApp({ backupStatus: async () => null });
    expect((await none.app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({ ok: true, backupAgoSec: null });
    const broken = await makeApp({ backupStatus: () => Promise.reject(new Error('EACCES')) });
    expect((await broken.app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({ ok: true, backupAgoSec: null });
  });

  it('время копии читается из файла сервиса backup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qd-backup-'));
    const file = join(dir, '.last-ok');
    expect(await lastBackupAt(file)).toBeNull();
    await writeFile(file, '1794000000\n');
    expect(await lastBackupAt(file)).toBe(1_794_000_000_000);
    await writeFile(file, 'garbage');
    expect(await lastBackupAt(file)).toBeNull();
  });

  it('GET /api/config отдаёт ссылку на мини-апп', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json()).toEqual({
      botUsername: 'quizduel_test_bot',
      appShortName: 'play',
      appUrl: 'https://t.me/quizduel_test_bot/play',
      docs: {
        version: DOCS_VERSION,
        termsUrl: 'https://telegra.ph/Quiz-Duel---Terms-of-Use-11-06',
        privacyUrl: 'https://telegra.ph/Quiz-Duel---Privacy-Policy-11-06',
      },
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

describe('POST /api/consents', () => {
  const post = (app: Awaited<ReturnType<typeof makeApp>>['app'], body: unknown, extra: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/consents',
      headers: { authorization: `tma ${makeInitData()}`, 'content-type': 'application/json', ...extra },
      payload: JSON.stringify(body),
    });

  it('без initData - 401', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/consents', payload: { docs: ['terms', 'privacy'], version: DOCS_VERSION } });
    expect(res.statusCode).toBe(401);
  });

  it('записывает оба документа с IP и User-Agent, /api/me видит принятие', async () => {
    const { app, users } = await makeApp();
    const res = await post(app, { docs: ['terms', 'privacy'], version: DOCS_VERSION }, { 'user-agent': 'TelegramBot-Test/1.0' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, docsVersion: DOCS_VERSION });
    expect(users.consents).toHaveLength(1);
    expect(users.consents[0]).toMatchObject({ userId: ilya.id, docs: ['terms', 'privacy'], version: DOCS_VERSION, userAgent: 'TelegramBot-Test/1.0' });
    expect(users.consents[0]!.ip).toBeTruthy();

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${makeInitData()}` } });
    expect(me.json().docsAccepted).toBe(true);
  });

  it('поддельный user_id в теле игнорируется: id только из initData', async () => {
    const { app, users } = await makeApp();
    const res = await post(app, { docs: ['terms', 'privacy'], version: DOCS_VERSION, user_id: 1 });
    // Лишние поля отклоняет строгая схема - чужой id подставить нельзя никак.
    expect(res.statusCode).toBe(400);
    expect(users.consents).toHaveLength(0);
    const ok = await post(app, { docs: ['terms', 'privacy'], version: DOCS_VERSION });
    expect(ok.statusCode).toBe(200);
    expect(users.consents[0]!.userId).toBe(ilya.id);
  });

  it('нужны оба документа', async () => {
    const { app } = await makeApp();
    const res = await post(app, { docs: ['terms'], version: DOCS_VERSION });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request', reason: 'all_docs_required' });
  });

  it('устаревшая версия - 409 и текущая версия в ответе', async () => {
    const { app } = await makeApp();
    const res = await post(app, { docs: ['terms', 'privacy'], version: '2020-01-01' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'stale_version', reason: DOCS_VERSION });
  });

  it('обновилась версия документов: при следующем входе снова шторка, старые записи журнала остаются', async () => {
    const { app, users } = await makeApp();
    await post(app, { docs: ['terms', 'privacy'], version: DOCS_VERSION });

    // Тексты поменяли и подняли DOCS_VERSION - тот же игрок, тот же журнал.
    const NEXT = '2026-12-01';
    const next = await buildApp({ env: { ...testEnv(), DOCS_VERSION: NEXT }, users, botUsername: 'quizduel_test_bot', logger: false });
    apps.push(next);
    const me = await next.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${makeInitData()}` } });
    expect(me.json().docsAccepted).toBe(false);

    expect((await post(next, { docs: ['terms', 'privacy'], version: DOCS_VERSION })).statusCode).toBe(409);
    expect((await post(next, { docs: ['terms', 'privacy'], version: NEXT })).statusCode).toBe(200);
    expect(users.consents.map((c) => c.version)).toEqual([DOCS_VERSION, NEXT]);
    const after = await next.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${makeInitData()}` } });
    expect(after.json().docsAccepted).toBe(true);
  });

  it('повторная отправка - новая строка в журнале, без ошибки', async () => {
    const { app, users } = await makeApp();
    await post(app, { docs: ['terms', 'privacy'], version: DOCS_VERSION });
    const again = await post(app, { docs: ['terms', 'privacy'], version: DOCS_VERSION });
    expect(again.statusCode).toBe(200);
    expect(users.consents).toHaveLength(2);
  });
});

describe('этап 7: профиль, лидерборд, соперник, разбор', () => {
  async function withStats() {
    const calls: string[] = [];
    const stats: StatsRepo = {
      async profile(userId) {
        calls.push(`profile:${userId}`);
        return null;
      },
      async leaderboard(userId) {
        calls.push(`leaderboard:${userId}`);
        return { top: [], me: { place: null, rating: 1000, games: 0, gamesToQualify: 5 } };
      },
      async player(viewer, target) {
        calls.push(`player:${viewer}:${target}`);
        return null;
      },
      async review(viewer, gameId) {
        calls.push(`review:${viewer}:${gameId}`);
        return null;
      },
      async achievements(userId) {
        calls.push(`achievements:${userId}`);
        return { items: [], unlocked: 0, total: 12 };
      },
    };
    const app = await buildApp({ env: testEnv(), users: memoryUsers(), stats, botUsername: 'quizduel_test_bot', logger: false });
    apps.push(app);
    return { app, calls };
  }
  const auth = () => ({ authorization: `tma ${makeInitData()}` });

  it('без initData - 401 на всех маршрутах', async () => {
    const { app, calls } = await withStats();
    for (const url of ['/api/profile', '/api/leaderboard', '/api/players/5', '/api/games/Abcde12345/review', '/api/achievements']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it('id игрока берётся только из initData, чужой профиль и разбор - 404, кривые id - 400', async () => {
    const { app, calls } = await withStats();
    expect((await app.inject({ method: 'GET', url: '/api/leaderboard', headers: auth() })).json()).toMatchObject({ me: { gamesToQualify: 5 } });
    expect((await app.inject({ method: 'GET', url: '/api/profile?userId=1', headers: auth() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/players/42', headers: auth() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/players/0x10', headers: auth() })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/players/99999999999999999999', headers: auth() })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/games/Abcde12345/review', headers: auth() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/games/bad/review', headers: auth() })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/achievements?userId=1', headers: auth() })).json()).toMatchObject({ total: 12 });
    expect(calls).toEqual([`leaderboard:${ilya.id}`, `profile:${ilya.id}`, `player:${ilya.id}:42`, `review:${ilya.id}:Abcde12345`, `achievements:${ilya.id}`]);
  });
});

describe('этап 8: уведомления от бота - POST /api/settings и разрешение писать', () => {
  const post = (app: Awaited<ReturnType<typeof makeApp>>['app'], body: unknown, initData = makeInitData()) =>
    app.inject({
      method: 'POST',
      url: '/api/settings',
      headers: { authorization: `tma ${initData}`, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });

  it('allows_write_to_pm из подписанного initData включает write_access; /api/me его показывает', async () => {
    const { app, users } = await makeApp();
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${makeInitData()}` } });
    expect(me.json()).toMatchObject({ notifications: true, writeAccess: false });
    const allowed = makeInitData({ user: { ...ilya, allows_write_to_pm: true } });
    const again = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${allowed}` } });
    expect(again.json()).toMatchObject({ writeAccess: true });
    // Следующий вход без поля разрешение не снимает (его мог дать /start у бота).
    await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `tma ${makeInitData()}` } });
    expect(users.rows.get(ilya.id)!.writeAccess).toBe(true);
  });

  it('выключить уведомления и отметить разрешение; id - только из initData; мусор - 400; без initData - 401', async () => {
    const { app, users } = await makeApp();
    expect((await post(app, { notifications: false })).json()).toMatchObject({ notifications: false, writeAccess: false });
    expect((await post(app, { writeAccess: true })).json()).toMatchObject({ notifications: false, writeAccess: true });
    expect(users.rows.get(ilya.id)).toMatchObject({ notifications: false, writeAccess: true });
    expect((await post(app, {})).statusCode).toBe(400);
    expect((await post(app, { writeAccess: false })).statusCode).toBe(400);
    expect((await post(app, { notifications: true, userId: 5 })).statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/api/settings', payload: { notifications: true } });
    expect(res.statusCode).toBe(401);
  });
});
