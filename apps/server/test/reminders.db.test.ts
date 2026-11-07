/**
 * Напоминание о ежедневной награде на Postgres: вечером по Москве, тем, у кого серия прервётся завтра,
 * один раз в день; выключенные уведомления, бан и «бот не может писать» - без сообщения.
 *
 * Нужен TEST_DATABASE_URL (в CI - сервис postgres). Без него файл пропускается.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dayKey, prevDayKey } from '@quiz-duel/shared';
import { createPrisma } from '../src/db.js';
import { createPrismaUsersRepo } from '../src/users.js';
import { cardMedia } from '../src/bot/cards.js';
import { dailyReminders } from '../src/bot/reminders.js';
import type { AlertApi } from '../src/bot/alerts.js';
import { lockDb } from './dbLock.js';

const url = process.env.TEST_DATABASE_URL;
/** 19:30 по Москве. */
const EVENING = Date.parse('2026-11-07T16:30:00Z');
const NOON = Date.parse('2026-11-07T09:00:00Z');

describe.skipIf(!url)('напоминание о ежедневной награде', () => {
  const prisma = createPrisma(url ?? 'postgresql://localhost/none');
  const users = createPrismaUsersRepo(prisma);
  let unlock: (() => Promise<void>) | null = null;
  const sent: { chatId: number; text: string; url: string; media: string }[] = [];
  let forbidden = false;
  const api: AlertApi = {
    async sendMessage() {
      throw new Error('ждём анимацию');
    },
    async sendAnimation(chatId, animation, other) {
      if (forbidden) throw Object.assign(new Error('Forbidden: bot was blocked by the user'), { error_code: 403 });
      const btn = other.reply_markup.inline_keyboard[0]![0] as { url: string };
      sent.push({ chatId, text: other.caption, url: btn.url, media: animation });
      return { message_id: sent.length };
    },
  };
  const reminders = dailyReminders({
    prisma,
    users,
    api,
    cards: cardMedia('https://quiz.example.sslip.io'),
    appUrl: 'https://t.me/q_battle_bot/QuizDuel',
    log: { warn: () => undefined },
  });

  beforeAll(async () => {
    unlock = await lockDb(url!);
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE coin_ledger, answers, user_achievements, category_stats, consents, games, users CASCADE');
    sent.length = 0;
    forbidden = false;
    const yesterday = prevDayKey(EVENING);
    const rows = [
      // id, имя, язык, день награды, дней подряд, уведомления, может писать, бан
      [5001, 'Илья', 'ru', yesterday, 3, true, true, false],
      [5002, 'Mark', 'en', yesterday, 6, true, true, false],
      [5003, 'Уже забрал', 'ru', dayKey(EVENING), 4, true, true, false],
      [5004, 'Выключил', 'ru', yesterday, 2, false, true, false],
      [5005, 'Без доступа', 'ru', yesterday, 2, true, false, false],
      [5006, 'Бан', 'ru', yesterday, 2, true, true, true],
      [5007, 'Серия прервалась', 'ru', prevDayKey(EVENING - 86_400_000), 9, true, true, false],
    ] as const;
    for (const [id, name, lang, day, count, notifications, writeAccess, banned] of rows) {
      await prisma.user.create({
        data: { id: BigInt(id), firstName: name, tgLanguage: lang, streakDay: day, streakCount: count, notifications, writeAccess, banned, source: 'legacy' },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await unlock?.();
  });

  it('днём - никому; вечером - тем, у кого серия под угрозой, один раз; на языке игрока', async () => {
    expect(await reminders.run(NOON)).toBe(0);
    expect(await reminders.run(EVENING)).toBe(2);
    expect(sent.map((s) => s.chatId)).toEqual([5001, 5002]);
    expect(sent[0]).toMatchObject({ media: 'https://quiz.example.sslip.io/bot/daily-ru.mp4', url: 'https://t.me/q_battle_bot/QuizDuel?startapp=daily' });
    // 3 дня подряд - сегодня 4-й: +40.
    expect(sent[0]!.text).toContain('день 4, +40 монет');
    expect(sent[1]!.text).toContain('day 7, +100 coins');
    // Через полчаса - то же окно, повторно не пишем.
    expect(await reminders.run(EVENING + 30 * 60_000)).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it('бот заблокирован (403) - больше не пишем ему вовсе', async () => {
    forbidden = true;
    expect(await reminders.run(EVENING)).toBe(0);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: 5001n } });
    expect(u.writeAccess).toBe(false);
    expect(u.remindDay).toBe(dayKey(EVENING));
  });
});
