/**
 * Обновление 2.0: напоминание о ежедневной награде. Вечером по Москве (19-22 ч) бот пишет тем, кто
 * вчера забрал награду, а сегодня ещё нет: иначе серия прервётся. Только тем, у кого включены
 * уведомления и бот может писать; заблокированным - нет. Одному игроку - не чаще раза в день.
 */
import { InlineKeyboard } from 'grammy';
import { DAY_OFFSET_MS, dayKey, prevDayKey, streakReward } from '@quiz-duel/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { UsersRepo } from '../users.js';
import type { CardMedia } from './cards.js';
import { isForbidden, sendCard, type AlertApi, type Log } from './alerts.js';
import { dailyTexts } from './texts.js';

/** Часы по Москве, когда напоминаем: [from, to). */
export const REMIND_HOURS = { from: 19, to: 22 } as const;
/** Сколько игроков за один проход (дальше - на следующем). */
const BATCH = 100;

export interface ReminderDeps {
  prisma: PrismaClient;
  users: Pick<UsersRepo, 'alertTarget' | 'setWriteAccess'>;
  api: AlertApi;
  cards?: CardMedia;
  /** Ссылка на мини-апп (t.me/<бот>/<имя>): кнопка открывает «Магазин» (startapp=daily). */
  appUrl: string;
  log: Log;
}

export function dailyReminders({ prisma, users, api, cards, appUrl, log }: ReminderDeps) {
  return {
    /** Один проход: сколько напоминаний ушло. Вне вечерних часов - ничего. */
    async run(now: number): Promise<number> {
      const hour = new Date(now + DAY_OFFSET_MS).getUTCHours();
      if (hour < REMIND_HOURS.from || hour >= REMIND_HOURS.to) return 0;
      const today = dayKey(now);
      const notToday = { OR: [{ remindDay: null }, { remindDay: { not: today } }] };
      const rows = await prisma.user.findMany({
        where: { notifications: true, writeAccess: true, banned: false, streakDay: prevDayKey(now), ...notToday },
        select: { id: true, streakCount: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      let sent = 0;
      for (const row of rows) {
        // Сначала отметка: упадёт отправка - второй раз за день всё равно не напишем.
        const claimed = await prisma.user.updateMany({ where: { id: row.id, ...notToday }, data: { remindDay: today } });
        if (claimed.count === 0) continue;
        const userId = Number(row.id);
        const target = await users.alertTarget(userId);
        if (!target) continue;
        const day = row.streakCount + 1;
        const t = dailyTexts[target.lang];
        try {
          await sendCard(api, cards, log, {
            chatId: userId,
            kind: 'daily',
            lang: target.lang,
            text: t.text(day, streakReward(day)),
            keyboard: new InlineKeyboard().url(t.button, `${appUrl}?startapp=daily`),
          });
          sent++;
        } catch (error) {
          if (isForbidden(error)) await users.setWriteAccess(userId, false);
          else log.warn({ err: error, userId }, 'daily reminder failed');
        }
      }
      return sent;
    },
  };
}
