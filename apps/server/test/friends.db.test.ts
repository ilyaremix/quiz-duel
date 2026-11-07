/**
 * Друзья на Postgres: приглашение по ссылке, заявки только тем, с кем играли, встречная заявка,
 * недавние соперники и награда за приглашение в списке.
 *
 * Нужен TEST_DATABASE_URL (в CI - сервис postgres). Без него файл пропускается.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrisma } from '../src/db.js';
import { createPrismaEconomyRepo } from '../src/economy.js';
import { createPrismaFriendsRepo, referrerOf, sourceOf } from '../src/friends.js';
import { lockDb } from './dbLock.js';

const url = process.env.TEST_DATABASE_URL;
const A = 4001;
const B = 4002;
const C = 4003;
const NEW = 4004;
const T0 = Date.parse('2026-11-07T07:00:00Z');

describe('источник прихода (без базы)', () => {
  it('start_param: src_, r_, g_ и мусор', () => {
    expect(sourceOf(null)).toBe('organic');
    expect(sourceOf('src_aidpost')).toBe('src_aidpost');
    expect(sourceOf('g_AbC123xyZ9')).toBe('g_AbC123xyZ9');
    expect(sourceOf('<script>')).toBe('organic');
    expect(referrerOf('r_100500')).toBe(100500);
    expect(referrerOf('r_0')).toBeNull();
    expect(referrerOf('r_12a')).toBeNull();
    expect(referrerOf('src_x')).toBeNull();
  });
});

describe.skipIf(!url)('друзья на Postgres', () => {
  const prisma = createPrisma(url ?? 'postgresql://localhost/none');
  const friends = createPrismaFriendsRepo(prisma);
  const eco = createPrismaEconomyRepo(prisma);
  let unlock: (() => Promise<void>) | null = null;
  const online = new Set<number>();
  const presence = (id: number) => (online.has(id) ? ('online' as const) : ('offline' as const));
  let seq = 0;

  const played = (a: number, b: number, at = T0) =>
    prisma.game.create({
      data: {
        id: `fr${String(++seq).padStart(8, '0')}`,
        mode: 'link',
        phase: 'finished',
        category: 'mix',
        creatorId: BigInt(a),
        opponentId: BigInt(b),
        questionIds: [],
        rev: 1,
        snapshot: {},
        finishedAt: new Date(at),
      },
    });

  beforeAll(async () => {
    unlock = await lockDb(url!);
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE friends, coin_ledger, inventory, task_progress, purchases, ad_views, topic_passes, tasks, answers, user_achievements, category_stats, consents, games, users CASCADE',
    );
    await eco.ensureTasks();
    for (const [id, name] of [
      [A, 'Илья'],
      [B, 'Марк'],
      [C, 'Аня'],
    ] as const) {
      await prisma.user.create({ data: { id: BigInt(id), firstName: name, source: 'legacy' } });
    }
    online.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await unlock?.();
  });

  it('пришёл по ссылке r_<id>: источник, пригласивший и сразу друзья; второй раз ничего не меняет', async () => {
    await prisma.user.create({ data: { id: BigInt(NEW), firstName: 'Новичок' } });
    expect(await friends.attribute(NEW, `r_${A}`)).toEqual({ inviterId: A });
    expect(await friends.attribute(NEW, `r_${B}`)).toEqual({ inviterId: null });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(NEW) } });
    expect(u.source).toBe(`r_${A}`);
    expect(Number(u.referrerId)).toBe(A);
    expect(await friends.isFriend(A, NEW)).toBe(true);
    expect(await friends.isFriend(NEW, A)).toBe(true);
    // Старый игрок по чужой ссылке другом не становится.
    expect(await friends.attribute(B, `r_${A}`)).toEqual({ inviterId: null });
    expect(await friends.isFriend(A, B)).toBe(false);
    // Первая партия друга - монеты обоим, в списке пригласившего видно.
    await eco.gamePlayed([NEW], T0);
    const list = await friends.list(A, presence);
    expect(list.ref).toEqual({ invited: 1, earned: 100 });
    expect(list.friends.map((f) => f.player.id)).toEqual([NEW]);
  });

  it('своя ссылка и мусор - без пригласившего', async () => {
    await prisma.user.create({ data: { id: BigInt(NEW), firstName: 'Новичок' } });
    expect(await friends.attribute(NEW, `r_${NEW}`)).toEqual({ inviterId: null });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(NEW) } });
    expect(u.referrerId).toBeNull();
    expect(u.source).toBe(`r_${NEW}`);
  });

  it('заявка - только тем, с кем играли; принять - друзья у обоих', async () => {
    expect(await friends.request(A, B)).toBe('not_allowed');
    expect(await friends.request(A, A)).toBe('not_allowed');
    expect(await friends.request(A, 9999)).toBe('not_found');
    await played(A, B);
    expect(await friends.request(A, B)).toBe('sent');
    expect(await friends.request(A, B)).toBe('sent');
    const forB = await friends.list(B, presence);
    expect(forB.incoming.map((f) => f.player.id)).toEqual([A]);
    expect(forB.recent).toEqual([]);
    const forA = await friends.list(A, presence);
    expect(forA.recent).toMatchObject([{ player: { id: B, name: 'Марк' }, sent: true }]);
    expect(await friends.respond(B, A, true)).toBe(true);
    expect(await friends.respond(B, A, true)).toBe(false);
    expect(await friends.isFriend(A, B)).toBe(true);
    expect(await friends.request(A, B)).toBe('already');
    online.add(B);
    expect((await friends.list(A, presence)).friends).toMatchObject([{ player: { id: B }, status: 'online' }]);
    await friends.remove(B, A);
    expect(await friends.isFriend(A, B)).toBe(false);
    expect(await friends.isFriend(B, A)).toBe(false);
  });

  it('оба нажали «Добавить» одновременно - сразу дружба, без двух висящих заявок', async () => {
    await played(A, B);
    const results = await Promise.all([friends.request(A, B), friends.request(B, A)]);
    expect(results.sort()).toEqual(['accepted', 'sent']);
    expect(await friends.isFriend(A, B)).toBe(true);
    expect(await friends.isFriend(B, A)).toBe(true);
    expect((await friends.list(A, presence)).incoming).toEqual([]);
    expect((await friends.list(B, presence)).incoming).toEqual([]);
  });

  it('встречная заявка - сразу дружба; отказ удаляет заявку', async () => {
    await played(A, C);
    await played(B, C);
    expect(await friends.request(A, C)).toBe('sent');
    expect(await friends.request(C, A)).toBe('accepted');
    expect(await friends.isFriend(A, C)).toBe(true);
    expect(await friends.request(B, C)).toBe('sent');
    expect(await friends.respond(C, B, false)).toBe(true);
    expect(await friends.isFriend(B, C)).toBe(false);
    expect((await friends.list(C, presence)).incoming).toEqual([]);
    // После отказа можно позвать снова.
    expect(await friends.request(B, C)).toBe('sent');
  });

  it('недавние соперники: свежие сверху, без друзей', async () => {
    await played(A, B, T0);
    await played(C, A, T0 + 60_000);
    let list = await friends.list(A, presence);
    expect(list.recent.map((r) => r.player.id)).toEqual([C, B]);
    expect(list.recent[0]!.at).toBe(T0 + 60_000);
    await friends.request(A, C);
    await friends.respond(C, A, true);
    list = await friends.list(A, presence);
    expect(list.recent.map((r) => r.player.id)).toEqual([B]);
    expect(list.friends.map((f) => f.player.id)).toEqual([C]);
  });
});
