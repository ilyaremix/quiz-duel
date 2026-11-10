/**
 * Оплата звёздами Telegram (валюта XTR) и проверка подписки на канал.
 * Счёт создаёт сервер (createInvoiceLink), приложение открывает его через openInvoice.
 * Зачисление - по successful_payment от Telegram, ровно один раз на платёж; потерянное обновление
 * добирает сверка со списком операций Telegram (см. attachPayments).
 */
import type { Api } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import { COIN_PACKS, isStarsProduct, starsProduct, type Lang, type StarsProduct } from '@quiz-duel/shared';
import { isMissingUser, type ChannelChecker, type EconomyRepo } from '../economy.js';
import type { InvoiceMaker } from '../http/app.js';
import type { QuizBot } from './index.js';

const PAYLOAD_PREFIX = 'qd1';

export function invoicePayload(product: StarsProduct, userId: number) {
  return `${PAYLOAD_PREFIX}:${product}:${userId}`;
}

export function parsePayload(payload: string): { product: StarsProduct; userId: number } | null {
  const [prefix, product, user] = payload.split(':');
  if (prefix !== PAYLOAD_PREFIX || !isStarsProduct(product) || !user || !/^\d{1,16}$/.test(user)) return null;
  return { product, userId: Number(user) };
}

const fmt = (lang: Lang, n: number) => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');

export const invoiceTexts = {
  ru: {
    coins: (n: number) => ({ title: `${fmt('ru', n)} монет`, description: `Монеты Quiz Duel: свечение аватарки, реакции и новые темы` }),
    adFree: { title: 'Без рекламы', description: 'Навсегда отключает ролики между партиями в Quiz Duel' },
    thanks: (what: string) => `Оплата прошла: ${what}. Спасибо!`,
    adFreeDone: 'реклама отключена навсегда',
    coinsDone: (n: number) => `+${fmt('ru', n)} монет`,
    alreadyAdFree: 'Реклама у вас уже отключена',
    badInvoice: 'Счёт устарел - откройте магазин и попробуйте снова',
  },
  en: {
    coins: (n: number) => ({ title: `${fmt('en', n)} coins`, description: 'Quiz Duel coins: avatar glow, reactions and new topics' }),
    adFree: { title: 'No ads', description: 'Turns off videos between games in Quiz Duel forever' },
    thanks: (what: string) => `Payment received: ${what}. Thank you!`,
    adFreeDone: 'ads are off forever',
    coinsDone: (n: number) => `+${fmt('en', n)} coins`,
    alreadyAdFree: 'Ads are already off for you',
    badInvoice: 'This invoice is out of date - open the shop and try again',
  },
} as const;

export function botInvoices(api: Api): InvoiceMaker {
  return {
    async link({ userId, product, lang }) {
      const t = invoiceTexts[lang];
      const what = starsProduct(product);
      const pack = COIN_PACKS.find((p) => `coins_${p.id}` === product);
      const text = product === 'adfree' ? t.adFree : t.coins(pack!.coins);
      return api.createInvoiceLink(text.title, text.description, invoicePayload(product, userId), '', 'XTR', [{ label: text.title, amount: what.stars }]);
    },
  };
}

/** Подписан ли игрок на канал. Бот должен быть админом канала, иначе Telegram не скажет - null. */
export function botChannels(api: Api, log: () => FastifyBaseLogger | null): ChannelChecker {
  let botId: number | null = null;
  return {
    async botIsAdmin(channel) {
      try {
        botId ??= (await api.getMe()).id;
        const member = await api.getChatMember(channel, botId);
        return member.status === 'administrator' || member.status === 'creator';
      } catch {
        return false;
      }
    },
    async isMember(channel, userId) {
      try {
        const member = await api.getChatMember(channel, userId);
        if (member.status === 'restricted') return member.is_member;
        return member.status === 'creator' || member.status === 'administrator' || member.status === 'member';
      } catch (error) {
        log()?.warn({ err: error, channel }, 'channel check failed');
        return null;
      }
    },
  };
}

export interface PaymentHooks {
  /** Монеты зачислены: экран магазина обновится сам. */
  changed(userId: number): void;
  lang(userId: number): Promise<Lang>;
}

/** Настройки для тестов. */
export interface PaymentOptions {
  /** Через сколько повторить сверку, если зачисление не удалось (база недоступна). */
  retryMs?: number;
}

export interface ReconcileReport {
  /** Сколько операций Telegram просмотрено за этот проход. */
  scanned: number;
  /** Сколько пропущенных оплат зачислено. */
  granted: number;
  /** Сколько пропущенных возвратов отработано. */
  revoked: number;
}

/** Операций за один запрос getStarTransactions (предел Telegram) и запросов за один проход. */
const PAGE = 100;
const MAX_PAGES = 200;
const RETRY_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;
/**
 * Сверка сама зачисляет только свежие оплаты: потерянный платёж находится за минуты. Старая операция
 * без записи в базе - не потеря при выкатке, а что-то другое (базу пересоздавали, платёж до появления
 * таблицы): такое автоматически не раздаём, а пишем в журнал для разбора вручную.
 */
const AUTO_GRANT_WINDOW_MS = 7 * 86_400_000;

/**
 * Обновление successful_payment приходит один раз, и потерять его можно: сервер выключили между
 * получением и записью, база не ответила. Поэтому источник правды - не обновление, а список операций
 * у самого Telegram (getStarTransactions): reconcile() проходит по нему и зачисляет оплаты, которых
 * нет в таблице purchases, и забирает монеты за возвраты, которые прошли мимо. Зачисление одно на
 * платёж (purchases.id - это telegram_payment_charge_id), так что сверка и обработчик друг другу не мешают.
 */
export function attachPayments(bot: QuizBot, economy: EconomyRepo, hooks: PaymentHooks, log: FastifyBaseLogger, options: PaymentOptions = {}) {
  /** Зачисляет платёж и благодарит игрока. false - этот платёж уже был зачислен. */
  async function deliver(input: { chargeId: string; userId: number; product: StarsProduct; stars: number }, via: 'update' | 'reconcile') {
    const granted = await economy.grantPurchase(input, Date.now());
    log.info({ userId: input.userId, product: input.product, stars: input.stars, chargeId: input.chargeId, granted, via }, 'stars payment');
    if (!granted) return false;
    hooks.changed(input.userId);
    const lang = await hooks.lang(input.userId).catch(() => 'en' as const);
    const t = invoiceTexts[lang];
    const what = starsProduct(input.product);
    await bot.api.sendMessage(input.userId, t.thanks(what.adFree ? t.adFreeDone : t.coinsDone(what.coins))).catch(() => undefined);
    return true;
  }

  // Операции Telegram отдаёт по порядку от старых к новым, старые не меняются: помним, сколько уже
  // сверено, и дальше читаем только новые. После перезапуска сервера история сверяется заново.
  let cursor = 0;
  let running: Promise<ReconcileReport> | null = null;

  async function scan(): Promise<ReconcileReport> {
    const report: ReconcileReport = { scanned: 0, granted: 0, revoked: 0 };
    const stale: string[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { transactions } = await bot.api.getStarTransactions({ offset: cursor, limit: PAGE });
      if (transactions.length === 0) break;
      const known = await economy.knownPurchases(transactions.map((tx) => tx.id));
      for (const tx of transactions) {
        if (tx.source?.type === 'user' && tx.source.transaction_type === 'invoice_payment') {
          const parsed = parsePayload(tx.source.invoice_payload ?? '');
          if (!parsed || known.has(tx.id)) continue;
          if (parsed.userId !== tx.source.user.id || tx.amount !== starsProduct(parsed.product).stars) {
            log.error({ chargeId: tx.id, payload: tx.source.invoice_payload, amount: tx.amount }, 'stars transaction does not match its invoice');
            continue;
          }
          if (tx.date * 1000 < Date.now() - AUTO_GRANT_WINDOW_MS) {
            stale.push(tx.id);
            continue;
          }
          try {
            if (await deliver({ chargeId: tx.id, userId: parsed.userId, product: parsed.product, stars: tx.amount }, 'reconcile')) report.granted += 1;
          } catch (error) {
            // Игрока нет в базе - повтор не поможет, и одна такая операция не должна останавливать сверку остальных.
            if (!isMissingUser(error)) throw error;
            log.error({ chargeId: tx.id, userId: parsed.userId }, 'stars payment from a user missing in the database');
            continue;
          }
          known.set(tx.id, { refunded: false });
        } else if (tx.receiver?.type === 'user') {
          // Возврат: id тот же, что у исходной оплаты.
          const purchase = known.get(tx.id);
          if (!purchase || purchase.refunded) continue;
          if (await economy.revokePurchase(tx.id, Date.now())) {
            report.revoked += 1;
            log.info({ chargeId: tx.id, revoked: true, via: 'reconcile' }, 'stars refund');
            hooks.changed(tx.receiver.user.id);
          }
          purchase.refunded = true;
        }
      }
      // Страница сверена целиком - только тогда двигаемся дальше (сбой посередине повторит её).
      cursor += transactions.length;
      report.scanned += transactions.length;
      if (transactions.length < PAGE) break;
      if (page === MAX_PAGES - 1) log.warn({ cursor }, 'stars reconcile stopped at the page limit, will continue next time');
    }
    if (report.granted > 0 || report.revoked > 0) log.warn(report, 'stars reconcile fixed missed payments');
    if (stale.length > 0)
      log.warn({ count: stale.length, chargeIds: stale.slice(0, 20) }, 'old stars payments without a purchase record, not granted automatically');
    return report;
  }

  /** Сверка с Telegram. Два прохода одновременно не идут: второй вызов ждёт идущий. */
  function reconcile(): Promise<ReconcileReport> {
    running ??= scan().finally(() => (running = null));
    return running;
  }

  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  /** Зачисление не удалось: сверяемся чуть позже, а если и сверка не прошла - ещё раз, всё реже. */
  function retrySoon(delay = options.retryMs ?? RETRY_MS) {
    if (retryTimer || stopped) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      reconcile().catch((error: unknown) => {
        log.error({ err: error }, 'stars reconcile failed, will retry');
        retrySoon(Math.min(RETRY_MAX_MS, delay * 2));
      });
    }, delay);
    retryTimer.unref();
  }

  // Перед списанием звёзд Telegram спрашивает бота: счёт свой, сумма та же, «Без рекламы» ещё не куплено.
  bot.on('pre_checkout_query', async (ctx) => {
    const q = ctx.preCheckoutQuery;
    const parsed = parsePayload(q.invoice_payload);
    const lang = await hooks.lang(q.from.id).catch(() => 'en' as const);
    const t = invoiceTexts[lang];
    const valid = parsed !== null && parsed.userId === q.from.id && q.currency === 'XTR' && q.total_amount === starsProduct(parsed.product).stars;
    if (!valid) {
      await ctx.answerPreCheckoutQuery(false, { error_message: t.badInvoice });
      return;
    }
    if (parsed.product === 'adfree') {
      const wallet = await economy.wallet(q.from.id, Date.now());
      if (wallet?.adFree) {
        await ctx.answerPreCheckoutQuery(false, { error_message: t.alreadyAdFree });
        return;
      }
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const parsed = parsePayload(payment.invoice_payload);
    if (!parsed || !ctx.from) {
      log.error({ payload: payment.invoice_payload }, 'payment with unknown payload');
      return;
    }
    try {
      await deliver({ chargeId: payment.telegram_payment_charge_id, userId: ctx.from.id, product: parsed.product, stars: payment.total_amount }, 'update');
    } catch (error) {
      // Звёзды уже списаны, а Telegram это обновление больше не пришлёт: платёж доберёт сверка.
      log.error({ err: error, chargeId: payment.telegram_payment_charge_id, userId: ctx.from.id }, 'stars payment not granted, will reconcile');
      retrySoon();
    }
  });

  // Звёзды вернули (refundStarPayment или Telegram): забираем то, что дал платёж.
  bot.on('message:refunded_payment', async (ctx) => {
    const refund = ctx.message.refunded_payment;
    try {
      const revoked = await economy.revokePurchase(refund.telegram_payment_charge_id, Date.now());
      log.info({ chargeId: refund.telegram_payment_charge_id, revoked, via: 'update' }, 'stars refund');
      if (revoked && ctx.from) hooks.changed(ctx.from.id);
    } catch (error) {
      log.error({ err: error, chargeId: refund.telegram_payment_charge_id }, 'stars refund not applied, will reconcile');
      retrySoon();
    }
  });

  return {
    reconcile,
    /** То же для таймеров: ошибку не бросает, а пишет в журнал. */
    async sweep() {
      await reconcile().catch((error: unknown) => log.error({ err: error }, 'stars reconcile failed'));
    },
    stop() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    },
  };
}
