/**
 * Админка на Postgres: все запросы статистики выполняются и считают по своим таблицам.
 * Нужен TEST_DATABASE_URL (в CI - сервис postgres). Без него файл пропускается.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrisma } from '../src/db.js';
import { createPrismaEconomyRepo } from '../src/economy.js';
import { createAdminRepo, dayDate } from '../src/admin.js';
import { adminIdsOf } from '../src/env.js';
import { lockDb } from './dbLock.js';

const url = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;
const NOW = Date.parse('2026-11-07T09:00:00Z');

describe('админы из окружения', () => {
  it('ADMIN_IDS, иначе владелец из автодеплоя; мусор отбрасывается', () => {
    expect([...adminIdsOf({ ADMIN_IDS: '1, 2,x', DEPLOY_NOTIFY_CHAT_ID: '9' })]).toEqual([1, 2]);
    expect([...adminIdsOf({ ADMIN_IDS: '', DEPLOY_NOTIFY_CHAT_ID: '764011380' })]).toEqual([764011380]);
    expect([...adminIdsOf({ ADMIN_IDS: '', DEPLOY_NOTIFY_CHAT_ID: '' })]).toEqual([]);
    expect([...adminIdsOf({ ADMIN_IDS: '-100123', DEPLOY_NOTIFY_CHAT_ID: '' })]).toEqual([]);
  });
});

describe.skipIf(!url)('статистика админки на Postgres', () => {
  const prisma = createPrisma(url ?? 'postgresql://localhost/none');
  const economy = createPrismaEconomyRepo(prisma);
  const admin = createAdminRepo({
    prisma,
    economy,
    live: () => ({ online: 3, inGame: 1 }),
    botUsername: 'q_battle_bot',
    appUrl: 'https://t.me/q_battle_bot/QuizDuel',
  });
  let unlock: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    unlock = await lockDb(url!);
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE events, user_days, links, friends, coin_ledger, inventory, task_progress, purchases, ad_views, topic_passes, tasks, answers, user_achievements, category_stats, consents, games, users CASCADE',
    );
    await economy.ensureTasks();
    // 4 игрока: двое пришли 10 дней назад (по посту и по ссылке друга), один - вчера, один старый.
    const add = (id: number, name: string, createdAt: number, source: string, extra: object = {}) =>
      prisma.user.create({ data: { id: BigInt(id), firstName: name, createdAt: new Date(createdAt), lastSeenAt: new Date(createdAt), source, ...extra } });
    await add(1, 'Илья', NOW - 10 * DAY, 'src_aidpost', { games: 4, onboarded: true });
    await add(2, 'Марк', NOW - 10 * DAY, 'r_1', { games: 1, referrerId: 1n, refRewarded: true, onboarded: true });
    await add(3, 'Аня', NOW - DAY, 'organic', { games: 0 });
    await add(4, 'Старый', NOW - 100 * DAY, 'legacy', { games: 50, banned: true });
    for (const [id, ago] of [
      [1, 10],
      [1, 9],
      [1, 3],
      [1, 0],
      [2, 10],
      [2, 3],
      [3, 1],
      [3, 0],
      [4, 0],
    ] as const) {
      await admin.touchDay(id, NOW - ago * DAY);
    }
    await admin.touchDay(1, NOW); // повтор за день ничего не добавляет
    await prisma.purchase.create({ data: { id: 'c1', userId: 1n, product: 'coins_m', stars: 75, createdAt: new Date(NOW - 2 * DAY) } });
    await prisma.purchase.create({ data: { id: 'c2', userId: 2n, product: 'adfree', stars: 100, createdAt: new Date(NOW - DAY) } });
    await prisma.adView.create({
      data: { id: 'ad1xxxxxxxxx', userId: 1n, purpose: 'forced', startedAt: new Date(NOW - DAY), doneAt: new Date(NOW - DAY + 15_000) },
    });
    await prisma.adView.create({ data: { id: 'ad2xxxxxxxxx', userId: 3n, purpose: 'forced', startedAt: new Date(NOW - DAY) } });
    await prisma.game.create({
      data: {
        id: 'adm0000001',
        mode: 'link',
        phase: 'finished',
        category: 'mix',
        creatorId: 1n,
        opponentId: 2n,
        questionIds: [],
        rev: 1,
        snapshot: {},
        finishedAt: new Date(NOW - 3 * DAY),
        variant: 'lives',
      },
    });
    await admin.track(1, ['home', 'quick', 'quick', 'shop'], NOW - DAY);
    await admin.track(2, ['quick'], NOW - DAY);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await unlock?.();
  });

  it('обзор: игроки, DAU, MAU, липкость, режимы', async () => {
    const o = await admin.overview(30, NOW);
    expect(o.live).toEqual({ online: 3, inGame: 1 });
    expect(o.kpi.users).toBe(4);
    expect(o.kpi.fresh).toBe(3);
    expect(o.kpi.mau).toBe(4);
    expect(o.kpi.games).toBe(1);
    expect(o.dau).toHaveLength(30);
    expect(o.dau.at(-1)!.v).toBe(3);
    expect(o.modes.find((m) => m.id === 'lives')).toMatchObject({ n: 1, p: 100 });
    expect((await admin.overview(90, NOW)).dau).toHaveLength(13);
  });

  it('удержание: кривая, когорты (старые игроки не считаются)', async () => {
    const r = await admin.retention(NOW);
    // Новички: Илья вернулся на 1-й день, Марк - нет, Аня (пришла вчера) - сегодня.
    expect(r.d1).toBe(66.7);
    expect(r.curve[0]).toEqual([0, 100]);
    expect(r.cohorts).toHaveLength(6);
    expect(r.cohortCols).toEqual(['D1', 'D3', 'D7', 'D14', 'D30']);
    expect(r.sticky).toHaveLength(30);
  });

  it('события и воронка новичка', async () => {
    const e = await admin.events(30, NOW);
    expect(e.events.find((x) => x.name === 'quick')).toEqual({ name: 'quick', kind: 'btn', count: 3, users: 2 });
    expect(e.events.find((x) => x.name === 'home')).toMatchObject({ kind: 'screen', count: 1 });
    expect(e.funnel).toEqual([
      { step: 'open', n: 3 },
      { step: 'onboard', n: 2 },
      { step: 'first', n: 2 },
      { step: 'three', n: 1 },
      { step: 'back', n: 2 },
    ]);
  });

  it('источники: пост, рефералы, без метки; ссылки из админки', async () => {
    expect(await admin.createLink('aidpost', 'Пост в канале')).toBe('https://t.me/q_battle_bot/QuizDuel?startapp=src_aidpost');
    await admin.createLink('fresh1', 'Новая');
    const s = await admin.sources(30, NOW);
    const by = (id: string) => s.sources.find((x) => x.id === id);
    expect(by('aidpost')).toMatchObject({ title: 'Пост в канале', users: 1, first: 100, stars: 75, auto: false });
    expect(by('ref')).toMatchObject({ users: 1, stars: 100, auto: true });
    expect(by('organic')).toMatchObject({ users: 1, first: 0 });
    expect(by('fresh1')).toMatchObject({ users: 0, url: 'https://t.me/q_battle_bot/QuizDuel?startapp=src_fresh1' });
    expect(s.refTop).toEqual([{ id: 1, name: 'Илья', invited: 1 }]);
  });

  it('деньги: звёзды, покупатели, реклама, монеты', async () => {
    await prisma.user.update({ where: { id: 1n }, data: { coins: 1000 } });
    await economy.buy(1, 'glow', 'neon', NOW);
    const m = await admin.money(30, NOW);
    expect(m.kpi).toMatchObject({ stars: 175, buyers: 2, arppu: 88, adFree: 1 });
    expect(m.products.map((p) => p.product)).toEqual(['adfree', 'coins_m']);
    expect(m.ads).toMatchObject({ forced: 2, forcedDone: 1, skipped: 1 });
    expect(m.coins.spend.glow).toBe(300);
    expect(m.stars.reduce((a, p) => a + p.v, 0)).toBe(175);
  });

  it('задания: свои заголовки, выключение, удаление', async () => {
    const saved = await admin.saveTask({ type: 'channel', channel: '@quiz_partner', goal: 1, reward: 80, on: false, titleRu: 'Партнёр', titleEn: null });
    expect(saved).toMatchObject({ type: 'channel', freq: 'once', on: false, titleRu: 'Партнёр' });
    const list = await admin.tasks();
    expect(list.find((t) => t.id === saved.id)).toMatchObject({ done: 0, botAdmin: null });
    const w = await economy.wallet(3, NOW);
    expect(w!.tasks.map((t) => t.id)).not.toContain(saved.id);
    await admin.saveTask({ id: saved.id, type: 'channel', channel: '@quiz_partner', goal: 1, reward: 80, on: true, titleRu: 'Партнёр', titleEn: null });
    expect((await economy.wallet(3, NOW))!.tasks.find((t) => t.id === saved.id)!.title).toEqual({ ru: 'Партнёр', en: 'Партнёр' });
    await admin.removeTask(saved.id);
    expect((await admin.tasks()).map((t) => t.id)).not.toContain(saved.id);
  });

  it('игроки: поиск, фильтры, баланс без ухода в минус, бан', async () => {
    expect((await admin.players('', 'all', NOW)).length).toBe(4);
    expect((await admin.players('мар', 'all', NOW)).map((p) => p.id)).toEqual([2]);
    expect((await admin.players('@', 'all', NOW)).length).toBe(4);
    expect((await admin.players('3', 'all', NOW)).map((p) => p.id)).toEqual([3]);
    expect((await admin.players('', 'paying', NOW)).map((p) => p.id).sort()).toEqual([1, 2]);
    expect((await admin.players('', 'banned', NOW)).map((p) => p.id)).toEqual([4]);
    expect((await admin.players('', 'new', NOW)).map((p) => p.id)).toEqual([3]);
    expect(await admin.adjustCoins(3, 500, 1, NOW)).toBe(500);
    expect(await admin.adjustCoins(3, -800, 1, NOW)).toBe(0);
    expect(await admin.adjustCoins(999, 5, 1, NOW)).toBeNull();
    const p = await admin.player(1);
    expect(p).toMatchObject({ id: 1, source: 'src_aidpost', stars: 75, purchases: [{ product: 'coins_m', stars: 75 }] });
    expect(await admin.setBanned(3, true)).toBe(true);
    expect(await admin.isBanned(3)).toBe(true);
    expect(await prisma.userDay.count({ where: { day: dayDate(NOW) } })).toBe(3);
  });
});
