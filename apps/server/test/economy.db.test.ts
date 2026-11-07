/**
 * Экономика на настоящем Postgres: серия входа, задания, покупки, реклама, звёзды, приглашения.
 * Главное - монеты не начисляются дважды и не уходят в минус даже при одновременных запросах.
 *
 * Нужен TEST_DATABASE_URL (в CI - сервис postgres). Без него файл пропускается.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADS, DEFAULT_TASKS, dayKey } from '@quiz-duel/shared';
import { createPrisma } from '../src/db.js';
import { createPrismaEconomyRepo, dailyOf, type ChannelChecker } from '../src/economy.js';
import { lockDb } from './dbLock.js';

const url = process.env.TEST_DATABASE_URL;
const A = 3001;
const B = 3002;
// 10:00 по Москве
const T0 = Date.parse('2026-11-07T07:00:00Z');
const DAY = 86_400_000;

describe('серия входа (без базы)', () => {
  it('день 1 у новичка, потом по кругу, пропуск - заново', () => {
    expect(dailyOf(null, 0, T0)).toEqual({ day: 1, series: 0, claimed: false, reward: 10 });
    expect(dailyOf(dayKey(T0), 1, T0)).toEqual({ day: 1, series: 1, claimed: true, reward: 10 });
    expect(dailyOf(dayKey(T0 - DAY), 3, T0)).toEqual({ day: 4, series: 3, claimed: false, reward: 40 });
    expect(dailyOf(dayKey(T0 - DAY), 7, T0)).toEqual({ day: 1, series: 7, claimed: false, reward: 10 });
    expect(dailyOf(dayKey(T0 - 2 * DAY), 5, T0)).toEqual({ day: 1, series: 0, claimed: false, reward: 10 });
  });

  it('сутки меняются в полночь по Москве', () => {
    expect(dayKey(Date.parse('2026-11-07T20:59:59Z'))).toBe('2026-11-07');
    expect(dayKey(Date.parse('2026-11-07T21:00:00Z'))).toBe('2026-11-08');
  });
});

describe.skipIf(!url)('экономика на Postgres', () => {
  const prisma = createPrisma(url ?? 'postgresql://localhost/none');
  let member: boolean | null = true;
  const checker: ChannelChecker = { isMember: async () => member, botIsAdmin: async () => member === true };
  const eco = createPrismaEconomyRepo(prisma, checker);
  let unlock: (() => Promise<void>) | null = null;

  const coins = async (id: number) => (await prisma.user.findUniqueOrThrow({ where: { id: BigInt(id) } })).coins;
  const give = (id: number, n: number) => prisma.user.update({ where: { id: BigInt(id) }, data: { coins: n } });

  beforeAll(async () => {
    unlock = await lockDb(url!);
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE coin_ledger, inventory, task_progress, purchases, ad_views, topic_passes, tasks, answers, user_achievements, category_stats, consents, games, users CASCADE',
    );
    await eco.ensureTasks();
    await prisma.user.create({ data: { id: BigInt(A), firstName: 'Илья' } });
    await prisma.user.create({ data: { id: BigInt(B), firstName: 'Марк' } });
    member = true;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await unlock?.();
  });

  it('кошелёк новичка: 0 монет, день 1, задания по умолчанию (история - только Premium)', async () => {
    const w = (await eco.wallet(A, T0))!;
    expect(w).toMatchObject({ coins: 0, adFree: false, glow: 'none', pack: 'base', passes: [], adDue: false, premium: false });
    expect(w.owned).toEqual({ glow: ['none'], pack: ['base'], topic: [] });
    expect(w.daily).toEqual({ day: 1, series: 0, claimed: false, reward: 10 });
    expect(w.tasks.map((t) => t.id)).toEqual(['play', 'ads', 'channel', 'invite']);
    await prisma.user.update({ where: { id: BigInt(A) }, data: { isPremium: true } });
    expect((await eco.wallet(A, T0))!.tasks.map((t) => t.id)).toContain('story');
    expect(await eco.wallet(9999, T0)).toBeNull();
    // Повторный запуск не трогает настроенные задания.
    await prisma.taskConfig.update({ where: { id: 'play' }, data: { reward: 55 } });
    await eco.ensureTasks();
    expect((await eco.taskConfigs()).find((t) => t.id === 'play')!.reward).toBe(55);
    expect(await eco.taskConfigs()).toHaveLength(DEFAULT_TASKS.length);
  });

  it('серия: раз в сутки, день 2 - +20, пропуск дня - снова день 1', async () => {
    const first = await eco.claimDaily(A, T0);
    expect(first).toMatchObject({ ok: true, reward: 10 });
    expect(await eco.claimDaily(A, T0 + 3600_000)).toEqual({ ok: false, error: 'already_claimed' });
    const second = await eco.claimDaily(A, T0 + DAY);
    expect(second).toMatchObject({ ok: true, reward: 20 });
    if (second.ok) expect(second.wallet.daily).toEqual({ day: 2, series: 2, claimed: true, reward: 20 });
    const restart = await eco.claimDaily(A, T0 + 3 * DAY);
    expect(restart).toMatchObject({ ok: true, reward: 10 });
    expect(await coins(A)).toBe(40);
    const ledger = await prisma.coinTx.findMany({ where: { userId: BigInt(A) }, orderBy: { id: 'asc' } });
    expect(ledger.map((r) => [r.delta, r.balance, r.reason])).toEqual([
      [10, 10, 'daily'],
      [20, 30, 'daily'],
      [10, 40, 'daily'],
    ]);
  });

  it('одновременные «Забрать» начисляют один раз', async () => {
    const results = await Promise.all([eco.claimDaily(A, T0), eco.claimDaily(A, T0), eco.claimDaily(A, T0)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await coins(A)).toBe(10);
  });

  it('«Сыграйте 3 партии»: прогресс за день, награда один раз, после 3 партий - реклама', async () => {
    expect(await eco.claimTask(A, 'play', T0)).toEqual({ ok: false, error: 'not_ready' });
    await eco.gamePlayed([A, B], T0);
    await eco.gamePlayed([A], T0 + 1000);
    let w = (await eco.wallet(A, T0))!;
    expect(w.tasks.find((t) => t.id === 'play')).toMatchObject({ count: 2, ready: false, claimed: false });
    expect(w.adDue).toBe(false);
    await eco.gamePlayed([A], T0 + 2000);
    w = (await eco.wallet(A, T0))!;
    expect(w.tasks.find((t) => t.id === 'play')).toMatchObject({ count: 3, ready: true });
    expect(w.adDue).toBe(true);
    expect(await eco.claimTask(A, 'play', T0)).toMatchObject({ ok: true, reward: 30 });
    expect(await eco.claimTask(A, 'play', T0)).toEqual({ ok: false, error: 'already_claimed' });
    // Назавтра - заново.
    expect((await eco.wallet(A, T0 + DAY))!.tasks.find((t) => t.id === 'play')).toMatchObject({ count: 0, claimed: false });
    expect(await eco.claimTask(A, 'nope', T0)).toEqual({ ok: false, error: 'not_found' });
    expect(await eco.claimTask(A, 'ads', T0)).toEqual({ ok: false, error: 'not_ready' });
  });

  it('выключенное в админке задание не видно и не забирается', async () => {
    await prisma.taskConfig.update({ where: { id: 'channel' }, data: { on: false } });
    expect((await eco.wallet(A, T0))!.tasks.map((t) => t.id)).not.toContain('channel');
    expect(await eco.claimTask(A, 'channel', T0)).toEqual({ ok: false, error: 'not_found' });
  });

  it('канал: не подписан, нельзя проверить, подписан - +100 один раз', async () => {
    member = false;
    expect(await eco.claimTask(A, 'channel', T0)).toEqual({ ok: false, error: 'not_subscribed' });
    member = null;
    expect(await eco.claimTask(A, 'channel', T0)).toEqual({ ok: false, error: 'cannot_verify' });
    member = true;
    expect(await eco.claimTask(A, 'channel', T0)).toMatchObject({ ok: true, reward: 100 });
    expect(await eco.claimTask(A, 'channel', T0)).toEqual({ ok: false, error: 'already_claimed' });
    expect((await eco.wallet(A, T0))!.tasks.find((t) => t.id === 'channel')).toMatchObject({ claimed: true, count: 1 });
  });

  it('история: только Premium и один раз', async () => {
    expect(await eco.claimTask(A, 'story', T0)).toEqual({ ok: false, error: 'premium_only' });
    await prisma.user.update({ where: { id: BigInt(A) }, data: { isPremium: true } });
    expect(await eco.claimTask(A, 'story', T0)).toMatchObject({ ok: true, reward: 150 });
    expect(await eco.claimTask(A, 'story', T0)).toEqual({ ok: false, error: 'already_claimed' });
  });

  it('покупка за монеты, надеть, нельзя надеть некупленное и купить дважды', async () => {
    expect(await eco.buy(A, 'glow', 'neon', T0)).toEqual({ ok: false, error: 'no_coins' });
    await give(A, 1000);
    const bought = await eco.buy(A, 'glow', 'neon', T0);
    expect(bought.ok).toBe(true);
    if (bought.ok) expect(bought.wallet).toMatchObject({ coins: 700, glow: 'none', owned: { glow: ['none', 'neon'] } });
    expect(await eco.buy(A, 'glow', 'neon', T0)).toEqual({ ok: false, error: 'owned' });
    expect(await eco.buy(A, 'glow', 'none', T0)).toEqual({ ok: false, error: 'owned' });
    expect(await eco.buy(A, 'glow', 'lava', T0)).toEqual({ ok: false, error: 'bad_item' });
    expect(await eco.equip(A, 'glow', 'gold', T0)).toEqual({ ok: false, error: 'not_owned' });
    expect(await eco.equip(A, 'glow', 'neon', T0)).toMatchObject({ ok: true, wallet: { glow: 'neon' } });
    expect(await eco.buy(A, 'pack', 'bold', T0)).toMatchObject({ ok: true, wallet: { coins: 300 } });
    expect(await eco.equip(A, 'pack', 'bold', T0)).toMatchObject({ ok: true, wallet: { pack: 'bold' } });
    expect(await eco.ownsPack(A, 'bold')).toBe(true);
    expect(await eco.ownsPack(A, 'party')).toBe(false);
    expect((await eco.looks([A, B])).get(A)).toEqual({ glow: 'neon', pack: 'bold' });
    expect(await eco.equip(A, 'glow', 'none', T0)).toMatchObject({ ok: true, wallet: { glow: 'none' } });
  });

  it('две покупки одновременно при деньгах на одну - проходит одна, баланс не в минусе', async () => {
    await give(A, 500);
    const results = await Promise.all([eco.buy(A, 'glow', 'gold', T0), eco.buy(A, 'glow', 'neon', T0), eco.buy(A, 'pack', 'bold', T0)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await coins(A)).toBeGreaterThanOrEqual(0);
  });

  it('реклама за монеты: только досмотренная, +15, не больше 5 в день', async () => {
    const start = await eco.adStart(A, 'reward', undefined, T0);
    expect(start).toMatchObject({ ok: true, sec: ADS.sec, src: '/ads/ad1.mp4' });
    if (!start.ok) return;
    expect(await eco.adDone(A, start.id, T0 + 5000)).toEqual({ ok: false, error: 'too_early' });
    expect(await eco.adDone(B, start.id, T0 + 20_000)).toEqual({ ok: false, error: 'not_found' });
    expect(await eco.adDone(A, start.id, T0 + 15_000)).toMatchObject({ ok: true, reward: 15 });
    expect(await eco.adDone(A, start.id, T0 + 16_000)).toEqual({ ok: false, error: 'already_claimed' });
    for (let i = 1; i < 5; i++) {
      const s = await eco.adStart(A, 'reward', undefined, T0 + i * 60_000);
      if (s.ok) await eco.adDone(A, s.id, T0 + i * 60_000 + 15_000);
    }
    expect(await coins(A)).toBe(75);
    expect(await eco.adStart(A, 'reward', undefined, T0 + 10 * 60_000)).toEqual({ ok: false, error: 'limit' });
    expect((await eco.wallet(A, T0))!.tasks.find((t) => t.id === 'ads')).toMatchObject({ count: 5, claimed: true });
    const late = await eco.adStart(B, 'reward', undefined, T0);
    if (late.ok) expect(await eco.adDone(B, late.id, T0 + ADS.ttlMs + 1)).toEqual({ ok: false, error: 'expired' });
  });

  it('обязательная реклама после 3 партий снимает долг; с «Без рекламы» её нет', async () => {
    for (let i = 0; i < 3; i++) await eco.gamePlayed([A], T0 + i);
    expect((await eco.wallet(A, T0))!.adDue).toBe(true);
    const s = await eco.adStart(A, 'forced', undefined, T0);
    if (!s.ok) throw new Error('нет ролика');
    expect(await eco.adDone(A, s.id, T0 + 15_000)).toMatchObject({ ok: true, reward: 0, wallet: { adDue: false } });
    await prisma.user.update({ where: { id: BigInt(B) }, data: { adFree: true } });
    for (let i = 0; i < 4; i++) await eco.gamePlayed([B], T0 + i);
    expect((await eco.wallet(B, T0))!.adDue).toBe(false);
    expect(await eco.adStart(B, 'forced', undefined, T0)).toEqual({ ok: false, error: 'ad_free' });
  });

  it('тема на 1 игру за рекламу; купленная навсегда убирает билеты', async () => {
    expect(await eco.adStart(A, 'topic', undefined, T0)).toEqual({ ok: false, error: 'bad_item' });
    const s = await eco.adStart(A, 'topic', 'space', T0);
    if (!s.ok) throw new Error('нет ролика');
    expect(await eco.adDone(A, s.id, T0 + 15_000)).toMatchObject({ ok: true, wallet: { passes: ['space'] } });
    await give(A, 1000);
    expect(await eco.buy(A, 'topic', 'space', T0)).toMatchObject({ ok: true, wallet: { coins: 0, passes: [], owned: { topic: ['space'] } } });
    expect(await eco.adStart(A, 'topic', 'space', T0)).toEqual({ ok: false, error: 'owned' });
  });

  it('платная тема: билет тратится один раз на партию, купленная - бесплатно', async () => {
    expect(await eco.topicAccess(A, 'games')).toBe('locked');
    expect(await eco.useTopic(A, 'games', 'g000000001', T0)).toBe(false);
    const s = await eco.adStart(A, 'topic', 'games', T0);
    if (!s.ok) throw new Error('нет ролика');
    await eco.adDone(A, s.id, T0 + 15_000);
    expect(await eco.topicAccess(A, 'games')).toBe('pass');
    expect(await eco.useTopic(A, 'games', 'g000000001', T0)).toBe(true);
    // Повтор того же старта (рестарт сервера) второй билет не берёт.
    expect(await eco.useTopic(A, 'games', 'g000000001', T0)).toBe(true);
    expect(await eco.topicAccess(A, 'games')).toBe('locked');
    expect(await eco.useTopic(A, 'games', 'g000000002', T0)).toBe(false);
    await give(A, 1000);
    await eco.buy(A, 'topic', 'games', T0);
    expect(await eco.topicAccess(A, 'games')).toBe('owned');
    expect(await eco.useTopic(A, 'games', 'g000000003', T0)).toBe(true);
  });

  it('звёзды: монеты зачисляются один раз на платёж, возврат забирает', async () => {
    expect(await eco.grantPurchase({ chargeId: 'ch1', userId: A, product: 'coins_m', stars: 75 }, T0)).toBe(true);
    expect(await eco.grantPurchase({ chargeId: 'ch1', userId: A, product: 'coins_m', stars: 75 }, T0)).toBe(false);
    expect(await coins(A)).toBe(1000);
    expect(await eco.grantPurchase({ chargeId: 'ch2', userId: A, product: 'adfree', stars: 100 }, T0)).toBe(true);
    expect((await eco.wallet(A, T0))!.adFree).toBe(true);
    await give(A, 400);
    expect(await eco.revokePurchase('ch1', T0)).toBe(true);
    expect(await eco.revokePurchase('ch1', T0)).toBe(false);
    expect(await coins(A)).toBe(0);
    expect(await eco.revokePurchase('ch2', T0)).toBe(true);
    expect((await eco.wallet(A, T0))!.adFree).toBe(false);
    expect(await eco.revokePurchase('nope', T0)).toBe(false);
  });

  it('приглашение: после первой партии друга +100 пригласившему и +50 другу, один раз', async () => {
    await prisma.user.update({ where: { id: BigInt(B) }, data: { referrerId: BigInt(A) } });
    await eco.gamePlayed([B], T0);
    await eco.gamePlayed([B], T0 + 1);
    expect(await coins(A)).toBe(100);
    expect(await coins(B)).toBe(50);
    expect((await eco.wallet(A, T0))!.tasks.find((t) => t.id === 'invite')).toMatchObject({ count: 1 });
  });

  it('журнал сходится с балансом', async () => {
    await eco.claimDaily(A, T0);
    await give(A, 10);
    await eco.grantPurchase({ chargeId: 'x', userId: A, product: 'coins_s', stars: 25 }, T0);
    await eco.buy(A, 'glow', 'neon', T0);
    const rows = await prisma.coinTx.findMany({ where: { userId: BigInt(A) }, orderBy: { id: 'asc' } });
    expect(rows.at(-1)!.balance).toBe(await coins(A));
    expect(rows.map((r) => r.reason)).toEqual(['daily', 'stars', 'buy']);
  });
});
