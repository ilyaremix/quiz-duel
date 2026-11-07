/**
 * Игрок в базе: данные из Telegram. Фото обновляется только из initData мини-аппа -
 * обновления бота (/start, inline-запрос) фото не несут и не должны его стирать.
 *
 * Нужен TEST_DATABASE_URL (в CI - сервис postgres). Без него файл пропускается.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../src/db.js';
import { createPrismaUsersRepo } from '../src/users.js';
import { lockDb } from './dbLock.js';

const url = process.env.TEST_DATABASE_URL;
const ID = 5001;
const PHOTO = 'https://t.me/i/userpic/320/player.jpg';

describe.skipIf(!url)('игрок на Postgres', () => {
  const prisma = createPrisma(url ?? 'postgresql://localhost/none');
  const users = createPrismaUsersRepo(prisma);
  let unlock: (() => Promise<void>) | null = null;
  const photoOf = async () => (await prisma.user.findUnique({ where: { id: BigInt(ID) }, select: { photoUrl: true } }))?.photoUrl;

  beforeAll(async () => {
    unlock = await lockDb(url!);
    await prisma.user.deleteMany({ where: { id: BigInt(ID) } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: BigInt(ID) } });
    await prisma.$disconnect();
    await unlock?.();
  });

  it('/start и inline-запрос у бота не стирают фото из мини-аппа', async () => {
    await users.upsertFromTelegram({ id: ID, first_name: 'Игрок', photo_url: PHOTO });
    expect(await photoOf()).toBe(PHOTO);
    // В ctx.from у бота поля photo_url не бывает никогда.
    const fromBot = await users.upsertFromTelegram({ id: ID, first_name: 'Игрок 2', language_code: 'en' }, 'bot');
    expect(fromBot.photoUrl).toBe(PHOTO);
    expect(fromBot.firstName).toBe('Игрок 2');
    expect(await photoOf()).toBe(PHOTO);
  });

  it('из мини-аппа без фото - фото снимается (игрок удалил его в Telegram)', async () => {
    await users.upsertFromTelegram({ id: ID, first_name: 'Игрок' });
    expect(await photoOf()).toBeNull();
  });

  it('первое появление через бота - игрок создаётся без фото', async () => {
    await prisma.user.deleteMany({ where: { id: BigInt(ID) } });
    const created = await users.upsertFromTelegram({ id: ID, first_name: 'Новичок' }, 'bot');
    expect(created.photoUrl).toBeNull();
  });
});
