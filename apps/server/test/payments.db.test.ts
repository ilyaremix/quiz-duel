/**
 * Оплата звёздами не теряется: настоящий grammY-бот и настоящий Postgres, вместо Telegram - подделка
 * с его правилами (очередь обновлений, подтверждение через offset, deleteWebhook с drop_pending_updates,
 * список операций со звёздами).
 *
 * Обращение из прода: «Заплатил звёздами, звёзды списались, а монеты не пришли» - в эту минуту
 * выкатывалась новая версия.
 *
 * Нужен TEST_DATABASE_URL (в CI - сервис postgres). Без него файл пропускается.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Bot, type Transformer } from 'grammy';
import { createPrisma } from '../src/db.js';
import { createPrismaEconomyRepo, type EconomyRepo } from '../src/economy.js';
import { attachPayments, invoicePayload } from '../src/bot/payments.js';
import { startBot, type QuizBot } from '../src/bot/index.js';
import { starsProduct, type StarsProduct } from '@quiz-duel/shared';
import { lockDb } from './dbLock.js';
import { BOT_TOKEN } from './helpers.js';
import { silentLog } from './socketWorld.js';

const url = process.env.TEST_DATABASE_URL;
const A = 4001;

type Json = Record<string, unknown>;

/** Время операции в Telegram (секунды): минуту назад, если не сказано иначе. */
const ago = (sec = 60) => Math.floor(Date.now() / 1000) - sec;

/** Обновление «оплата прошла», как его присылает Telegram. */
function paymentUpdate(updateId: number, userId: number, product: StarsProduct, chargeId: string): Json {
  const user = { id: userId, is_bot: false, first_name: 'Илья' };
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: ago(),
      chat: { id: userId, type: 'private', first_name: 'Илья' },
      from: user,
      successful_payment: {
        currency: 'XTR',
        total_amount: starsProduct(product).stars,
        invoice_payload: invoicePayload(product, userId),
        telegram_payment_charge_id: chargeId,
        provider_payment_charge_id: '',
      },
    },
  };
}

/** Строка из getStarTransactions: входящая оплата счёта. */
function incoming(userId: number, product: StarsProduct, chargeId: string, date = ago()): Json {
  return {
    id: chargeId,
    amount: starsProduct(product).stars,
    date,
    source: {
      type: 'user',
      transaction_type: 'invoice_payment',
      user: { id: userId, is_bot: false, first_name: 'Илья' },
      invoice_payload: invoicePayload(product, userId),
    },
  };
}

/** Строка из getStarTransactions: возврат звёзд игроку (id совпадает с исходной оплатой). */
function refund(userId: number, product: StarsProduct, chargeId: string): Json {
  return {
    id: chargeId,
    amount: starsProduct(product).stars,
    date: ago(30),
    receiver: { type: 'user', transaction_type: 'invoice_payment', user: { id: userId, is_bot: false, first_name: 'Илья' } },
  };
}

/** Подделка Telegram Bot API для одного бота. */
function fakeTelegram() {
  const t = {
    /** Обновления, которые Telegram держит для бота, пока тот их не подтвердит. */
    queue: [] as Json[],
    transactions: [] as Json[],
    sent: [] as Array<{ chat_id: number; text: string }>,
    transformer: (async (_prev, method, payload) => {
      const p = payload as Json;
      const ok = (result: unknown) => ({ ok: true, result }) as never;
      if (method === 'deleteWebhook') {
        if (p.drop_pending_updates) t.queue = [];
        return ok(true);
      }
      if (method === 'getUpdates') {
        const offset = Number(p.offset ?? 0);
        // Запрос с offset подтверждает всё, что раньше него.
        if (offset > 0) t.queue = t.queue.filter((u) => Number(u.update_id) >= offset);
        if (t.queue.length === 0) await new Promise((r) => setTimeout(r, 10));
        return ok(t.queue.slice(0, Number(p.limit ?? 100)));
      }
      if (method === 'getStarTransactions') {
        const offset = Number(p.offset ?? 0);
        return ok({ transactions: t.transactions.slice(offset, offset + Number(p.limit ?? 100)) });
      }
      if (method === 'sendMessage') {
        t.sent.push({ chat_id: Number(p.chat_id), text: String(p.text) });
        return ok({ message_id: 1, date: 0, chat: { id: p.chat_id, type: 'private' } });
      }
      return ok(true);
    }) as Transformer,
  };
  return t;
}

function fakeBot(telegram: ReturnType<typeof fakeTelegram>): QuizBot {
  const bot = new Bot(BOT_TOKEN, {
    botInfo: {
      id: 1,
      is_bot: true,
      first_name: 'Quiz',
      username: 'quiz_test_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: true,
    } as never,
  });
  bot.api.config.use(telegram.transformer);
  return bot as unknown as QuizBot;
}

describe.skipIf(!url)('оплата звёздами не теряется', () => {
  const prisma = createPrisma(url ?? 'postgresql://localhost/none');
  const eco = createPrismaEconomyRepo(prisma);
  let unlock: (() => Promise<void>) | null = null;
  const stops: Array<() => Promise<void>> = [];

  const coins = async (id: number) => (await prisma.user.findUniqueOrThrow({ where: { id: BigInt(id) } })).coins;
  const hooks = { changed: () => undefined, lang: async () => 'ru' as const };

  /** «Новый процесс поднялся»: обработчики оплаты и опрос Telegram, как в index.ts. */
  function boot(telegram: ReturnType<typeof fakeTelegram>, economy: EconomyRepo = eco) {
    const bot = fakeBot(telegram);
    const payments = attachPayments(bot, economy, hooks, silentLog, { retryMs: 30 });
    const poller = startBot(bot, silentLog);
    stops.push(() => poller.stop());
    return { bot, payments, poller };
  }

  const until = async (check: () => Promise<boolean>, ms = 1500) => {
    for (const end = Date.now() + ms; Date.now() < end;) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  beforeAll(async () => {
    unlock = await lockDb(url!);
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE coin_ledger, inventory, task_progress, purchases, ad_views, topic_passes, tasks, answers, user_achievements, category_stats, consents, games, users CASCADE',
    );
    await prisma.user.create({ data: { id: BigInt(A), firstName: 'Илья' } });
  });

  afterEach(async () => {
    for (const stop of stops.splice(0)) await stop();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await unlock?.();
  });

  it('оплата прошла, пока сервер перезапускался: новый процесс её зачисляет', async () => {
    const telegram = fakeTelegram();
    // Старый процесс уже остановлен, новый ещё не поднялся: Telegram держит обновление у себя.
    telegram.queue.push(paymentUpdate(501, A, 'coins_m', 'charge-deploy'));
    boot(telegram);
    await until(async () => (await coins(A)) > 0);
    expect(await coins(A)).toBe(1000);
    expect(await prisma.purchase.count({ where: { id: 'charge-deploy' } })).toBe(1);
    // Разделитель тысяч в ru-RU - неразрывный пробел.
    expect(telegram.sent.map((m) => ({ ...m, text: m.text.replace(/\s/g, ' ') }))).toEqual([{ chat_id: A, text: 'Оплата прошла: +1 000 монет. Спасибо!' }]);
  });

  it('база не ответила в момент зачисления: платёж доначисляется сверкой с Telegram, ровно один раз', async () => {
    const telegram = fakeTelegram();
    telegram.queue.push(paymentUpdate(601, A, 'coins_s', 'charge-db-down'));
    telegram.transactions.push(incoming(A, 'coins_s', 'charge-db-down'));
    let failures = 1;
    const flaky: EconomyRepo = {
      ...eco,
      grantPurchase: async (input, now) => {
        if (failures-- > 0) throw new Error("Can't reach database server");
        return eco.grantPurchase(input, now);
      },
    };
    const { payments } = boot(telegram, flaky);
    await until(async () => (await coins(A)) > 0);
    expect(await coins(A)).toBe(300);
    // Повторная сверка ничего не задваивает.
    await payments.reconcile();
    expect(await coins(A)).toBe(300);
    expect(telegram.sent).toHaveLength(1);
  });

  it('сверка: чужие и уже зачисленные операции не трогает, пропущенный возврат забирает монеты', async () => {
    const telegram = fakeTelegram();
    await eco.grantPurchase({ chargeId: 'known', userId: A, product: 'coins_s', stars: 25 }, Date.now());
    await eco.grantPurchase({ chargeId: 'refunded', userId: A, product: 'coins_m', stars: 75 }, Date.now());
    telegram.transactions.push(
      incoming(A, 'coins_s', 'known'),
      incoming(A, 'coins_m', 'refunded'),
      // Не наш счёт и неверная сумма - не зачисляются.
      {
        id: 'foreign',
        amount: 5,
        date: 1,
        source: { type: 'user', transaction_type: 'invoice_payment', user: { id: A, is_bot: false, first_name: 'x' }, invoice_payload: 'other:1' },
      },
      { ...incoming(A, 'coins_l', 'cheap'), amount: 1 },
      { id: 'fragment', amount: 1000, date: 2, receiver: { type: 'fragment' } },
      incoming(A, 'coins_l', 'missed'),
      refund(A, 'coins_m', 'refunded'),
      // Старая операция без записи (базу пересоздавали) - не раздаём автоматически.
      incoming(A, 'coins_l', 'ancient', ago(30 * 86_400)),
      // Игрока нет в базе - сверку остальных это не останавливает.
      incoming(999_001, 'coins_s', 'ghost'),
      incoming(A, 'coins_s', 'missed-2'),
    );
    const { payments } = boot(telegram);
    const report = await payments.reconcile();
    expect(report).toMatchObject({ scanned: 10, granted: 2, revoked: 1 });
    // 300 (known) + 2500 (missed) + 300 (missed-2); 1000 за refunded забрали.
    expect(await coins(A)).toBe(3100);
    // Следующий проход читает только новое.
    expect(await payments.reconcile()).toEqual({ scanned: 0, granted: 0, revoked: 0 });
  });

  it('остановка сервера ждёт обработчик, который уже зачисляет платёж', async () => {
    const telegram = fakeTelegram();
    telegram.queue.push(paymentUpdate(701, A, 'coins_s', 'charge-stop'));
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => (entered = resolve));
    const slow: EconomyRepo = {
      ...eco,
      grantPurchase: async (input, now) => {
        entered();
        await new Promise((r) => setTimeout(r, 150));
        return eco.grantPurchase(input, now);
      },
    };
    const { poller } = boot(telegram, slow);
    await started;
    await poller.stop();
    expect(await coins(A)).toBe(300);
  });
});
