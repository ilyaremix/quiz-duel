/**
 * Оплата звёздами Telegram (валюта XTR) и проверка подписки на канал.
 * Счёт создаёт сервер (createInvoiceLink), приложение открывает его через openInvoice.
 * Зачисление - только по successful_payment от Telegram, ровно один раз на платёж.
 */
import type { Api } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import { COIN_PACKS, isStarsProduct, starsProduct, type Lang, type StarsProduct } from '@quiz-duel/shared';
import type { ChannelChecker, EconomyRepo } from '../economy.js';
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
      return api.createInvoiceLink(text.title, text.description, invoicePayload(product, userId), '', 'XTR', [
        { label: text.title, amount: what.stars },
      ]);
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

export function attachPayments(bot: QuizBot, economy: EconomyRepo, hooks: PaymentHooks, log: FastifyBaseLogger) {
  // Перед списанием звёзд Telegram спрашивает бота: счёт свой, сумма та же, «Без рекламы» ещё не куплено.
  bot.on('pre_checkout_query', async (ctx) => {
    const q = ctx.preCheckoutQuery;
    const parsed = parsePayload(q.invoice_payload);
    const lang = await hooks.lang(q.from.id).catch(() => 'en' as const);
    const t = invoiceTexts[lang];
    const valid =
      parsed !== null && parsed.userId === q.from.id && q.currency === 'XTR' && q.total_amount === starsProduct(parsed.product).stars;
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
    const granted = await economy.grantPurchase(
      { chargeId: payment.telegram_payment_charge_id, userId: ctx.from.id, product: parsed.product, stars: payment.total_amount },
      Date.now(),
    );
    log.info({ userId: ctx.from.id, product: parsed.product, stars: payment.total_amount, granted }, 'stars payment');
    if (!granted) return;
    hooks.changed(ctx.from.id);
    const lang = await hooks.lang(ctx.from.id).catch(() => 'en' as const);
    const t = invoiceTexts[lang];
    const what = starsProduct(parsed.product);
    await ctx.reply(t.thanks(what.adFree ? t.adFreeDone : t.coinsDone(what.coins))).catch(() => undefined);
  });

  // Звёзды вернули (refundStarPayment или Telegram): забираем то, что дал платёж.
  bot.on('message:refunded_payment', async (ctx) => {
    const refund = ctx.message.refunded_payment;
    const revoked = await economy.revokePurchase(refund.telegram_payment_charge_id, Date.now());
    log.info({ chargeId: refund.telegram_payment_charge_id, revoked }, 'stars refund');
    if (revoked && ctx.from) hooks.changed(ctx.from.id);
  });
}
