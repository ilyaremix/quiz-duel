import { InlineKeyboard } from 'grammy';
import { gameLink } from '@quiz-duel/shared';
import type { GameAlert, GameAlerts } from '../game/manager.js';
import type { UsersRepo } from '../users.js';
import { alertTexts } from './texts.js';

/** То, что нужно от Bot API (в тестах - подделка). */
export interface AlertApi {
  sendMessage(
    chatId: number,
    text: string,
    other: { parse_mode: 'HTML'; reply_markup: InlineKeyboard; link_preview_options: { is_disabled: boolean } },
  ): Promise<unknown>;
}

type Log = { warn: (obj: object, msg?: string) => void };

/** Ошибка Telegram «бот не может писать этому пользователю» (не нажимал /start, заблокировал бота). */
const isForbidden = (error: unknown) => (error as { error_code?: number } | null)?.error_code === 403;

/**
 * Уведомления от бота. Пишем, только если игрок разрешил (write_access) и не выключил
 * уведомления в настройках. Язык - получателя. Кнопка открывает мини-апп сразу в этой партии
 * (startapp=g_<id>): лобби, идущая дуэль или её итоги.
 * Telegram ответил 403 - больше не пробуем, пока игрок снова не разрешит.
 */
export function botAlerts(api: AlertApi, users: UsersRepo, appUrl: string, log: Log): GameAlerts & { flush(): Promise<void> } {
  let pending: Promise<unknown> = Promise.resolve();
  const deliver = async (userId: number, alert: GameAlert) => {
    const target = await users.alertTarget(userId);
    if (!target?.notifications || !target.writeAccess) return;
    const t = alertTexts[target.lang];
    const { text, button } = t.render(alert);
    try {
      await api.sendMessage(userId, text, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().url(button, gameLink(appUrl, alert.gameId)),
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      if (isForbidden(error)) await users.setWriteAccess(userId, false);
      else throw error;
    }
  };
  return {
    send(userId, alert) {
      const job = deliver(userId, alert).catch((error: unknown) => log.warn({ err: error, userId, kind: alert.kind }, 'bot alert failed'));
      pending = Promise.all([pending, job]);
    },
    /** Дождаться отправки всех уведомлений (тесты). */
    async flush() {
      await pending;
    },
  };
}
