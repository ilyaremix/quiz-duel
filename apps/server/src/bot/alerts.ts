import { InlineKeyboard } from 'grammy';
import { gameLink, type Lang } from '@quiz-duel/shared';
import type { GameAlert, GameAlerts } from '../game/manager.js';
import type { UsersRepo } from '../users.js';
import { alertTexts } from './texts.js';
import { animationFileId, cardOfAlert, type CardKind, type CardMedia } from './cards.js';

/** То, что нужно от Bot API (в тестах - подделка). */
export interface AlertApi {
  sendMessage(
    chatId: number,
    text: string,
    other: { parse_mode: 'HTML'; reply_markup: InlineKeyboard; link_preview_options: { is_disabled: boolean } },
  ): Promise<unknown>;
  sendAnimation(chatId: number, animation: string, other: { caption: string; parse_mode: 'HTML'; reply_markup: InlineKeyboard }): Promise<unknown>;
}

export type Log = { warn: (obj: object, msg?: string) => void };

/** Ошибка Telegram «бот не может писать этому пользователю» (не нажимал /start, заблокировал бота). */
export const isForbidden = (error: unknown) => (error as { error_code?: number } | null)?.error_code === 403;

/**
 * Сообщение с анимированной карточкой. Не вышло (Telegram не скачал ролик, сбой file_id) - то же
 * обычным текстом. «Нельзя писать» (403) пробрасывается: тогда не поможет и текст.
 */
export async function sendCard(
  api: AlertApi,
  cards: CardMedia | undefined,
  log: Log,
  msg: { chatId: number; kind: CardKind; lang: Lang; text: string; keyboard: InlineKeyboard },
) {
  if (cards) {
    try {
      const sent = await api.sendAnimation(msg.chatId, cards.media(msg.kind, msg.lang), { caption: msg.text, parse_mode: 'HTML', reply_markup: msg.keyboard });
      cards.remember(msg.kind, msg.lang, animationFileId(sent));
      return;
    } catch (error) {
      if (isForbidden(error)) throw error;
      cards.forget(msg.kind, msg.lang);
      log.warn({ err: error, kind: msg.kind }, 'bot animation failed, sending text');
    }
  }
  await api.sendMessage(msg.chatId, msg.text, { parse_mode: 'HTML', reply_markup: msg.keyboard, link_preview_options: { is_disabled: true } });
}

/**
 * Уведомления от бота. Пишем, только если игрок разрешил (write_access) и не выключил
 * уведомления в настройках. Язык - получателя. Кнопка открывает мини-апп сразу в этой партии
 * (startapp=g_<id>): лобби, идущая дуэль или её итоги. Сверху - анимированная карточка.
 * Telegram ответил 403 - больше не пробуем, пока игрок снова не разрешит.
 */
export function botAlerts(api: AlertApi, users: UsersRepo, appUrl: string, log: Log, cards?: CardMedia): GameAlerts & { flush(): Promise<void>; readonly pending: number } {
  // Отправки в полёте. Раньше была цепочка Promise.all([pending, job]): она держала в памяти
  // вложенные массивы всех когда-либо отправленных уведомлений (+12 МБ на 200 000).
  const inflight = new Set<Promise<unknown>>();
  const deliver = async (userId: number, alert: GameAlert) => {
    const target = await users.alertTarget(userId);
    if (!target?.notifications || !target.writeAccess) return;
    const t = alertTexts[target.lang];
    const { text, button } = t.render(alert);
    try {
      await sendCard(api, cards, log, {
        chatId: userId,
        kind: cardOfAlert(alert),
        lang: target.lang,
        text,
        keyboard: new InlineKeyboard().url(button, gameLink(appUrl, alert.gameId)),
      });
    } catch (error) {
      if (isForbidden(error)) await users.setWriteAccess(userId, false);
      else throw error;
    }
  };
  return {
    send(userId, alert) {
      const job = deliver(userId, alert).catch((error: unknown) => log.warn({ err: error, userId, kind: alert.kind }, 'bot alert failed'));
      inflight.add(job);
      void job.finally(() => inflight.delete(job));
    },
    /** Дождаться отправки всех уведомлений (тесты). */
    async flush() {
      while (inflight.size > 0) await Promise.all([...inflight]);
    },
    /** Сколько отправок ещё идёт (тесты: после отправки ничего не остаётся). */
    get pending() {
      return inflight.size;
    },
  };
}
