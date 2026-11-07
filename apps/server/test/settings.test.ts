/**
 * Этап 9: настройки игрока на сервере. Язык: порядок «настройка → language_code → английский»,
 * смена посреди партии - снимок с вопросом на новом языке приходит только этому игроку.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/http/app.js';
import { ilya, makeInitData, memoryUsers, testEnv } from './helpers.js';
import { lastOf, lobby, mark, player, start, until, world } from './socketWorld.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(onSettingsChanged?: (userId: number) => void) {
  const users = memoryUsers();
  const app = await buildApp({ env: testEnv(), users, botUsername: 'quizduel_test_bot', onSettingsChanged, logger: false });
  apps.push(app);
  return { app, users };
}

const auth = (user = ilya) => ({ authorization: `tma ${makeInitData({ user })}` });
const me = (app: Awaited<ReturnType<typeof makeApp>>['app'], user = ilya) =>
  app.inject({ method: 'GET', url: '/api/me', headers: auth(user) }).then((r) => r.json());
const post = (app: Awaited<ReturnType<typeof makeApp>>['app'], body: unknown, user = ilya) =>
  app.inject({ method: 'POST', url: '/api/settings', headers: { ...auth(user), 'content-type': 'application/json' }, payload: JSON.stringify(body) });

describe('этап 9: язык - POST /api/settings { language }', () => {
  it('«Авто» по language_code: ru, uk, be, kk - русский, остальное и пустое - английский', async () => {
    const { app } = await makeApp();
    for (const [code, lang] of [['ru', 'ru'], ['uk', 'ru'], ['be', 'ru'], ['kk', 'ru'], ['en', 'en'], ['de', 'en'], ['pt-br', 'en']] as const) {
      const body = await me(app, { ...ilya, language_code: code });
      expect(body, code).toMatchObject({ language: 'auto', lang, autoLang: lang });
    }
    expect(await me(app, { id: 777, first_name: 'Без языка' })).toMatchObject({ lang: 'en', autoLang: 'en' });
  });

  it('явный выбор главнее language_code, сохраняется на сервере и виден с любого устройства', async () => {
    const { app, users } = await makeApp();
    await me(app);
    const res = await post(app, { language: 'en' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ language: 'en', lang: 'en', autoLang: 'ru' });
    expect(users.rows.get(ilya.id)!.language).toBe('en');
    // «Другое устройство» - тот же игрок с тем же language_code.
    expect(await me(app)).toMatchObject({ language: 'en', lang: 'en', autoLang: 'ru' });
    expect((await post(app, { language: 'auto' })).json()).toMatchObject({ language: 'auto', lang: 'ru' });
  });

  it('неизвестный язык и лишние поля - 400; userId из тела игнорировать нельзя - 400', async () => {
    const { app } = await makeApp();
    expect((await post(app, { language: 'de' })).statusCode).toBe(400);
    expect((await post(app, { language: 'ru', userId: 5 })).statusCode).toBe(400);
    expect((await post(app, {})).statusCode).toBe(400);
  });

  it('смена языка зовёт onSettingsChanged с id из initData; другие настройки - нет', async () => {
    const calls: number[] = [];
    const { app } = await makeApp((id) => void calls.push(id));
    await post(app, { notifications: false });
    expect(calls).toEqual([]);
    await post(app, { language: 'en' });
    expect(calls).toEqual([ilya.id]);
  });

  it('сбой пересылки партии не ломает сохранение', async () => {
    const { app, users } = await makeApp(() => {
      throw new Error('boom');
    });
    expect((await post(app, { language: 'en' })).statusCode).toBe(200);
    expect(users.rows.get(ilya.id)!.language).toBe('en');
  });
});

describe('этап 9: язык посреди партии', () => {
  it('вопрос приходит на новом языке только тому, кто сменил язык; rev и таймер те же', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    await start(w, a, b, gameId);
    const before = lastOf(a, gameId)!;
    const oppBefore = b.states.length;
    expect(before.question!.text).toMatch(/[а-яё]/i);

    w.users.rows.get(ilya.id)!.language = 'en';
    await w.games.userChanged(ilya.id);
    const after = await until(() => a.states.filter((v) => v.id === gameId).length > a.states.indexOf(before) + 1 && lastOf(a, gameId), 'снимок на английском');
    expect(after.question!.text).not.toMatch(/[а-яё]/i);
    expect(after.question!.index).toBe(before.question!.index);
    expect(after.question!.endsAt).toBe(before.question!.endsAt);
    expect(after.rev).toBe(before.rev);
    // Соперник ничего нового не получил.
    expect(b.states.length).toBe(oppBefore);

    // Ответ после смены языка засчитывается как обычно (позиции вариантов не поменялись).
    const ack = await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 });
    expect(ack).toMatchObject({ ok: true, accepted: true });
  });

  it('вне партии - ничего не шлёт и не падает', async () => {
    const w = await world();
    const a = await player(w, ilya);
    await w.games.userChanged(ilya.id);
    expect(a.states).toEqual([]);
  });
});

describe('этап 9: режим без анимаций - POST /api/settings { reducedMotion }', () => {
  it('по умолчанию «Авто»; «Вкл» / «Выкл» сохраняются на сервере и видны в /api/me', async () => {
    const { app, users } = await makeApp();
    expect(await me(app)).toMatchObject({ reducedMotion: 'auto' });
    expect((await post(app, { reducedMotion: 'on' })).json()).toMatchObject({ reducedMotion: 'on' });
    expect(users.rows.get(ilya.id)!.reducedMotion).toBe('on');
    expect(await me(app)).toMatchObject({ reducedMotion: 'on' });
    expect((await post(app, { reducedMotion: 'off' })).json()).toMatchObject({ reducedMotion: 'off' });
  });

  it('неизвестное значение - 400; на партию не влияет (onSettingsChanged не зовётся)', async () => {
    const calls: number[] = [];
    const { app } = await makeApp((id) => void calls.push(id));
    expect((await post(app, { reducedMotion: 'maybe' })).statusCode).toBe(400);
    expect((await post(app, { reducedMotion: true })).statusCode).toBe(400);
    await post(app, { reducedMotion: 'on' });
    expect(calls).toEqual([]);
  });
});

describe('этап 9: вибрация и уведомления - POST /api/settings', () => {
  it('вибрация по умолчанию включена, выключается и сохраняется; уведомления - как на этапе 8', async () => {
    const { app, users } = await makeApp();
    expect(await me(app)).toMatchObject({ haptics: true, notifications: true });
    expect((await post(app, { haptics: false })).json()).toMatchObject({ haptics: false, notifications: true });
    expect(users.rows.get(ilya.id)!.haptics).toBe(false);
    expect(await me(app)).toMatchObject({ haptics: false });
    expect((await post(app, { notifications: false, haptics: true })).json()).toMatchObject({ haptics: true, notifications: false });
    expect((await post(app, { haptics: 'yes' })).statusCode).toBe(400);
  });

  it('ответ - все настройки сразу', async () => {
    const { app } = await makeApp();
    await me(app);
    expect((await post(app, { haptics: true })).json()).toEqual({
      notifications: true,
      writeAccess: false,
      language: 'auto',
      lang: 'ru',
      autoLang: 'ru',
      reducedMotion: 'auto',
      theme: 'auto',
      haptics: true,
      onboarded: false,
    });
  });

  it('обновление 2.0: тема оформления сохраняется и приходит в /api/me', async () => {
    const { app } = await makeApp();
    await me(app);
    expect((await post(app, { theme: 'light' })).json()).toMatchObject({ theme: 'light' });
    expect(await me(app)).toMatchObject({ theme: 'light' });
    expect((await post(app, { theme: 'neon' })).statusCode).toBe(400);
  });
});

describe('этап 9: онбординг - POST /api/settings { onboarded: true }', () => {
  it('новичок не прошёл онбординг; принятие документов (шторка по ссылке) его не отмечает; отметка - навсегда', async () => {
    const { app, users } = await makeApp();
    expect(await me(app)).toMatchObject({ onboarded: false, docsAccepted: false });
    // Пришёл по ссылке: документы в шторке, онбординг - после партии.
    const consent = await app.inject({
      method: 'POST',
      url: '/api/consents',
      headers: { ...auth(), 'content-type': 'application/json' },
      payload: JSON.stringify({ docs: ['terms', 'privacy'], version: testEnv().DOCS_VERSION }),
    });
    expect(consent.statusCode).toBe(200);
    expect(await me(app)).toMatchObject({ onboarded: false, docsAccepted: true });
    expect((await post(app, { onboarded: true })).json()).toMatchObject({ onboarded: true });
    expect(users.rows.get(ilya.id)!.onboarded).toBe(true);
    expect(await me(app)).toMatchObject({ onboarded: true });
    // Снять отметку нельзя.
    expect((await post(app, { onboarded: false })).statusCode).toBe(400);
  });
});
