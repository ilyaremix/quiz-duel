/**
 * Обновление 2.0: монеты, серия входа, задания, покупки за монеты, реклама и звёзды.
 * Все изменения монет - в транзакции под блокировкой строки игрока и со строкой в coin_ledger.
 * Ключ строки журнала уникален: повтор награды (двойной тап, повтор запроса) ничего не начислит.
 */
import { randomBytes } from 'node:crypto';
import {
  ADS,
  DEFAULT_TASKS,
  FREQ_OF,
  GLOWS,
  PACKS,
  REFERRAL,
  dayKey,
  isGlow,
  isPack,
  isPremiumTopic,
  nextDayStart,
  prevDayKey,
  priceOf,
  starsProduct,
  streakReward,
  type AdPurpose,
  type AdStartResponse,
  type ClaimResponse,
  type DailyView,
  type EconomyErrorCode,
  type GlowId,
  type PackId,
  type PremiumTopic,
  type ShopKind,
  type StarsProduct,
  type TaskConfigView,
  type TaskFreq,
  type TaskType,
  type TaskView,
  type WalletResponse,
} from '@quiz-duel/shared';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type EcoFailure = { ok: false; error: EconomyErrorCode };
export type EcoResult<T = object> = ({ ok: true } & T) | EcoFailure;

/** Проверка подписки на канал: true/false, null - проверить нельзя (бот не админ канала). */
export interface ChannelChecker {
  isMember(channel: string, userId: number): Promise<boolean | null>;
  /** Для админки: бот - админ канала (только тогда Telegram отвечает о подписке). */
  botIsAdmin(channel: string): Promise<boolean>;
}

/** Что приложению нужно знать об оформлении игроков (лобби, партия, рейтинг). */
export interface Looks {
  glow: GlowId;
  pack: PackId;
}

export interface PurchaseInput {
  chargeId: string;
  userId: number;
  product: StarsProduct;
  stars: number;
}

export interface EconomyRepo {
  /** Задания по умолчанию, если таблица пуста (первый запуск). */
  ensureTasks(): Promise<void>;
  /** Все задания (и выключенные) - для админки. */
  taskConfigs(): Promise<TaskConfigView[]>;
  wallet(userId: number, now: number): Promise<WalletResponse | null>;
  claimDaily(userId: number, now: number): Promise<EcoResult<ClaimResponse>>;
  claimTask(userId: number, taskId: string, now: number): Promise<EcoResult<ClaimResponse>>;
  buy(userId: number, kind: ShopKind, item: string, now: number): Promise<EcoResult<{ wallet: WalletResponse }>>;
  equip(userId: number, kind: 'glow' | 'pack', item: string, now: number): Promise<EcoResult<{ wallet: WalletResponse }>>;
  adStart(userId: number, purpose: AdPurpose, topic: PremiumTopic | undefined, now: number): Promise<EcoResult<AdStartResponse>>;
  adDone(userId: number, id: string, now: number): Promise<EcoResult<ClaimResponse>>;
  /** Партия доиграна: прогресс «Сыграйте 3 партии», счётчик до рекламы, награда за приглашение. */
  gamePlayed(userIds: readonly number[], now: number): Promise<void>;
  /** Оплата звёздами прошла: начислить. false - этот платёж уже зачислен. */
  grantPurchase(input: PurchaseInput, now: number): Promise<boolean>;
  /** Звёзды вернули: забрать монеты (сколько есть) или «Без рекламы». */
  revokePurchase(chargeId: string, now: number): Promise<boolean>;
  /** Надетое оформление игроков. */
  looks(ids: readonly number[]): Promise<Map<number, Looks>>;
  /** Набор реакций у игрока (купленные): для проверки реакции в партии. */
  ownsPack(userId: number, pack: PackId): Promise<boolean>;
  /** Платная тема: куплена навсегда, есть билет на 1 игру или закрыта. */
  topicAccess(userId: number, topic: PremiumTopic): Promise<'owned' | 'pass' | 'locked'>;
  /** Платные темы, купленные навсегда (для «Микса»). */
  ownedTopics(userId: number): Promise<PremiumTopic[]>;
  /** Партия в платной теме началась: билет на 1 игру использован (если тема не куплена). */
  useTopic(userId: number, topic: PremiumTopic, gameId: string, now: number): Promise<boolean>;
}

export const AD_SRC = '/ads/ad1.mp4';

/** Ошибка, которой транзакция сообщает отказ (откатывает всё и возвращается как EcoFailure). */
class Refusal extends Error {
  constructor(readonly code: EconomyErrorCode) {
    super(code);
  }
}

function refuse(code: EconomyErrorCode): never {
  throw new Refusal(code);
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

function asTask(row: {
  id: string;
  type: string;
  channel: string | null;
  goal: number;
  reward: number;
  freq: string;
  on: boolean;
  sort: number;
  titleRu: string | null;
  titleEn: string | null;
}): TaskConfigView {
  const type = row.type as TaskType;
  return {
    id: row.id,
    type,
    channel: row.channel,
    goal: row.goal,
    reward: row.reward,
    freq: (FREQ_OF[type] ?? row.freq) as TaskFreq,
    on: row.on,
    sort: row.sort,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
  };
}

/** Свой заголовок из админки: если задан только на одном языке - он же на другом. */
function titleOf(t: TaskConfigView): TaskView['title'] {
  const ru = t.titleRu ?? t.titleEn ?? null;
  const en = t.titleEn ?? t.titleRu ?? null;
  return ru && en ? { ru, en } : null;
}

/** День серии для экрана: что забрано сегодня или что можно забрать. */
export function dailyOf(streakDay: string | null, streakCount: number, now: number): DailyView {
  const today = dayKey(now);
  if (streakDay === today) {
    return { day: ((streakCount - 1) % 7) + 1, series: streakCount, claimed: true, reward: streakReward(streakCount) };
  }
  const alive = streakDay === prevDayKey(now);
  const next = alive ? streakCount + 1 : 1;
  return { day: ((next - 1) % 7) + 1, series: alive ? streakCount : 0, claimed: false, reward: streakReward(next) };
}

export function createPrismaEconomyRepo(prisma: PrismaClient, checker?: ChannelChecker): EconomyRepo {
  /** Монеты на счёт игрока и строка в журнале. Возвращает новый баланс. */
  async function credit(tx: Prisma.TransactionClient, userId: number, delta: number, reason: string, ref: string | null, key: string | null) {
    const row = await tx.user.update({
      where: { id: BigInt(userId) },
      data: { coins: { increment: delta } },
      select: { coins: true },
    });
    if (row.coins < 0) refuse('no_coins');
    await tx.coinTx.create({ data: { userId: BigInt(userId), delta, balance: row.coins, reason, ref, key } });
    return row.coins;
  }

  /** Блокирует строку игрока до конца транзакции; нет игрока - not_found. */
  async function lock(tx: Prisma.TransactionClient, userId: number) {
    const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM users WHERE id = ${BigInt(userId)} FOR UPDATE`;
    if (rows.length === 0) refuse('not_found');
  }

  /** Транзакция с отказами: Refusal и повтор уникального ключа превращаются в EcoFailure. */
  async function attempt<T extends object>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    onDuplicate: EconomyErrorCode = 'already_claimed',
  ): Promise<EcoResult<T>> {
    try {
      const value = await prisma.$transaction(fn);
      return { ok: true, ...value };
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, error: error.code };
      if (isUniqueViolation(error)) return { ok: false, error: onDuplicate };
      throw error;
    }
  }

  async function configs(db: Db, onlyOn: boolean) {
    const rows = await db.taskConfig.findMany({ where: onlyOn ? { on: true } : {}, orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
    return rows.map(asTask);
  }

  async function walletOf(db: Db, userId: number, now: number): Promise<WalletResponse | null> {
    const id = BigInt(userId);
    const user = await db.user.findUnique({
      where: { id },
      select: { coins: true, adFree: true, glow: true, reactionPack: true, streakDay: true, streakCount: true, gamesSinceAd: true, isPremium: true },
    });
    if (!user) return null;
    const today = dayKey(now);
    const [owned, passes, tasks, progress, invited] = await Promise.all([
      db.owned.findMany({ where: { userId: id }, select: { kind: true, item: true } }),
      db.topicPass.findMany({ where: { userId: id, usedAt: null }, select: { topic: true } }),
      configs(db, true),
      db.taskProgress.findMany({ where: { userId: id, day: { in: [today, ''] } } }),
      db.user.count({ where: { referrerId: id, refRewarded: true } }),
    ]);
    const prog = (taskId: string, day: string) => progress.find((p) => p.taskId === taskId && p.day === day);
    const items = (kind: string) => owned.filter((o) => o.kind === kind).map((o) => o.item);

    const views: TaskView[] = [];
    for (const t of tasks) {
      // История в Telegram с виджетом-ссылкой - только у Premium: остальным задание не показываем.
      if (t.type === 'story' && !user.isPremium) continue;
      const base = { id: t.id, type: t.type, freq: t.freq, channel: t.channel, goal: t.goal, reward: t.reward, title: titleOf(t) };
      if (t.type === 'play') {
        const p = prog(t.id, today);
        const count = p?.count ?? 0;
        views.push({ ...base, count, claimed: Boolean(p?.claimedAt), ready: count >= t.goal && !p?.claimedAt });
      } else if (t.type === 'ads') {
        const count = prog(t.id, today)?.count ?? 0;
        views.push({ ...base, count, claimed: count >= t.goal, ready: false });
      } else if (t.type === 'invite') {
        views.push({ ...base, count: invited, claimed: false, ready: false });
      } else {
        const claimed = Boolean(prog(t.id, '')?.claimedAt);
        views.push({ ...base, count: claimed ? 1 : 0, claimed, ready: !claimed });
      }
    }

    return {
      coins: user.coins,
      adFree: user.adFree,
      glow: isGlow(user.glow) ? user.glow : 'none',
      pack: isPack(user.reactionPack) ? user.reactionPack : 'base',
      owned: {
        glow: GLOWS.filter((g) => g === 'none' || items('glow').includes(g)),
        pack: PACKS.filter((p) => p === 'base' || items('pack').includes(p)),
        topic: items('topic').filter(isPremiumTopic),
      },
      passes: [...new Set(passes.map((p) => p.topic).filter(isPremiumTopic))],
      daily: dailyOf(user.streakDay, user.streakCount, now),
      tasks: views,
      resetAt: nextDayStart(now),
      adDue: !user.adFree && user.gamesSinceAd >= ADS.every,
      premium: user.isPremium,
    };
  }

  /** Кошелёк после изменения (вне транзакции: она уже зафиксирована). */
  async function fresh(userId: number, now: number) {
    const wallet = await walletOf(prisma, userId, now);
    if (!wallet) throw new Error(`игрок ${userId} пропал`);
    return wallet;
  }

  async function claimOnce(userId: number, task: TaskConfigView, now: number) {
    const result = await attempt(async (tx) => {
      await lock(tx, userId);
      const key = { userId_taskId_day: { userId: BigInt(userId), taskId: task.id, day: '' } };
      const p = await tx.taskProgress.findUnique({ where: key });
      if (p?.claimedAt) refuse('already_claimed');
      await tx.taskProgress.upsert({
        where: key,
        create: { userId: BigInt(userId), taskId: task.id, day: '', count: 1, claimedAt: new Date(now) },
        update: { count: 1, claimedAt: new Date(now) },
      });
      await credit(tx, userId, task.reward, 'task', task.id, `task:${task.id}:${userId}`);
      return { reward: task.reward };
    });
    if (!result.ok) return result;
    return { ok: true as const, reward: result.reward, wallet: await fresh(userId, now) };
  }

  return {
    async ensureTasks() {
      if ((await prisma.taskConfig.count()) > 0) return;
      await prisma.taskConfig.createMany({ data: DEFAULT_TASKS.map((t) => ({ ...t })), skipDuplicates: true });
    },

    taskConfigs: () => configs(prisma, false),

    wallet: (userId, now) => walletOf(prisma, userId, now),

    async claimDaily(userId, now) {
      const today = dayKey(now);
      const result = await attempt(async (tx) => {
        await lock(tx, userId);
        const u = await tx.user.findUniqueOrThrow({ where: { id: BigInt(userId) }, select: { streakDay: true, streakCount: true } });
        if (u.streakDay === today) refuse('already_claimed');
        const series = u.streakDay === prevDayKey(now) ? u.streakCount + 1 : 1;
        const reward = streakReward(series);
        await tx.user.update({ where: { id: BigInt(userId) }, data: { streakDay: today, streakCount: series } });
        await credit(tx, userId, reward, 'daily', `day${((series - 1) % 7) + 1}`, `daily:${userId}:${today}`);
        return { reward };
      });
      if (!result.ok) return result;
      return { ok: true, reward: result.reward, wallet: await fresh(userId, now) };
    },

    async claimTask(userId, taskId, now) {
      const task = (await configs(prisma, true)).find((t) => t.id === taskId);
      if (!task) return { ok: false, error: 'not_found' };

      if (task.type === 'play') {
        const today = dayKey(now);
        const result = await attempt(async (tx) => {
          await lock(tx, userId);
          const key = { userId_taskId_day: { userId: BigInt(userId), taskId, day: today } };
          const p = await tx.taskProgress.findUnique({ where: key });
          if (p?.claimedAt) refuse('already_claimed');
          if (!p || p.count < task.goal) refuse('not_ready');
          await tx.taskProgress.update({ where: key, data: { claimedAt: new Date(now) } });
          await credit(tx, userId, task.reward, 'task', taskId, `task:${taskId}:${userId}:${today}`);
          return { reward: task.reward };
        });
        if (!result.ok) return result;
        return { ok: true, reward: result.reward, wallet: await fresh(userId, now) };
      }

      if (task.type === 'channel') {
        const done = await prisma.taskProgress.findUnique({ where: { userId_taskId_day: { userId: BigInt(userId), taskId, day: '' } } });
        if (done?.claimedAt) return { ok: false, error: 'already_claimed' };
        if (!task.channel || !checker) return { ok: false, error: 'cannot_verify' };
        const member = await checker.isMember(task.channel, userId);
        if (member === null) return { ok: false, error: 'cannot_verify' };
        if (!member) return { ok: false, error: 'not_subscribed' };
        return claimOnce(userId, task, now);
      }

      if (task.type === 'story') {
        // Опубликованную историю проверить нельзя: награда - по возвращении, один раз и только Premium.
        const user = await prisma.user.findUnique({ where: { id: BigInt(userId) }, select: { isPremium: true } });
        if (!user) return { ok: false, error: 'not_found' };
        if (!user.isPremium) return { ok: false, error: 'premium_only' };
        return claimOnce(userId, task, now);
      }

      // Реклама начисляется за каждый досмотренный ролик, приглашение - когда друг сыграл.
      return { ok: false, error: 'not_ready' };
    },

    async buy(userId, kind, item, now) {
      const price = priceOf(kind, item);
      if (price === null) return { ok: false, error: 'bad_item' };
      if (price === 0) return { ok: false, error: 'owned' };
      const result = await attempt(async (tx) => {
        await lock(tx, userId);
        const id = BigInt(userId);
        const owned = await tx.owned.findUnique({ where: { userId_kind_item: { userId: id, kind, item } } });
        if (owned) refuse('owned');
        const { coins } = await tx.user.findUniqueOrThrow({ where: { id }, select: { coins: true } });
        if (coins < price) refuse('no_coins');
        await credit(tx, userId, -price, 'buy', `${kind}:${item}`, null);
        await tx.owned.create({ data: { userId: id, kind, item } });
        // Тема навсегда: билеты на 1 игру по ней больше не нужны.
        if (kind === 'topic') await tx.topicPass.deleteMany({ where: { userId: id, topic: item, usedAt: null } });
        return {};
      }, 'owned');
      if (!result.ok) return result;
      return { ok: true, wallet: await fresh(userId, now) };
    },

    async equip(userId, kind, item, now) {
      if (kind === 'glow' ? !isGlow(item) : !isPack(item)) return { ok: false, error: 'bad_item' };
      const id = BigInt(userId);
      const free = item === 'none' || item === 'base';
      if (!free) {
        const owned = await prisma.owned.findUnique({ where: { userId_kind_item: { userId: id, kind, item } } });
        if (!owned) return { ok: false, error: 'not_owned' };
      }
      const done = await prisma.user.updateMany({ where: { id }, data: kind === 'glow' ? { glow: item } : { reactionPack: item } });
      if (done.count === 0) return { ok: false, error: 'not_found' };
      return { ok: true, wallet: await fresh(userId, now) };
    },

    async adStart(userId, purpose, topic, now) {
      const wallet = await walletOf(prisma, userId, now);
      if (!wallet) return { ok: false, error: 'not_found' };
      if (purpose === 'forced' && wallet.adFree) return { ok: false, error: 'ad_free' };
      if (purpose === 'reward') {
        const task = wallet.tasks.find((t) => t.type === 'ads');
        if (!task) return { ok: false, error: 'not_found' };
        if (task.count >= task.goal) return { ok: false, error: 'limit' };
      }
      if (purpose === 'topic') {
        if (!topic || !isPremiumTopic(topic)) return { ok: false, error: 'bad_item' };
        if (wallet.owned.topic.includes(topic)) return { ok: false, error: 'owned' };
      }
      const id = randomBytes(12).toString('base64url');
      await prisma.adView.create({
        data: { id, userId: BigInt(userId), purpose, topic: purpose === 'topic' ? topic! : null, startedAt: new Date(now) },
      });
      return { ok: true, id, sec: ADS.sec, src: AD_SRC };
    },

    async adDone(userId, adId, now) {
      const today = dayKey(now);
      const result = await attempt(async (tx) => {
        await lock(tx, userId);
        const view = await tx.adView.findUnique({ where: { id: adId } });
        if (!view || Number(view.userId) !== userId) refuse('not_found');
        if (view!.doneAt) refuse('already_claimed');
        const elapsed = now - view!.startedAt.getTime();
        // Засчитывается только досмотренный ролик: сервер сам знает, когда его начали.
        if (elapsed < ADS.sec * 1000 - ADS.graceMs) refuse('too_early');
        if (elapsed > ADS.ttlMs) refuse('expired');
        await tx.adView.update({ where: { id: adId }, data: { doneAt: new Date(now) } });
        const id = BigInt(userId);
        let reward = 0;
        if (view!.purpose === 'forced') {
          await tx.user.update({ where: { id }, data: { gamesSinceAd: 0 } });
        } else if (view!.purpose === 'topic') {
          await tx.topicPass.create({ data: { userId: id, topic: view!.topic! } });
        } else {
          const task = (await configs(tx, true)).find((t) => t.type === 'ads');
          if (!task) refuse('not_found');
          const key = { userId_taskId_day: { userId: id, taskId: task!.id, day: today } };
          const p = await tx.taskProgress.findUnique({ where: key });
          if ((p?.count ?? 0) >= task!.goal) refuse('limit');
          await tx.taskProgress.upsert({
            where: key,
            create: { userId: id, taskId: task!.id, day: today, count: 1 },
            update: { count: { increment: 1 } },
          });
          reward = task!.reward;
          await credit(tx, userId, reward, 'ad', task!.id, `ad:${adId}`);
        }
        // Любой досмотренный ролик закрывает долг по обязательной рекламе.
        if (view!.purpose !== 'forced') await tx.user.update({ where: { id }, data: { gamesSinceAd: 0 } });
        return { reward };
      });
      if (!result.ok) return result;
      return { ok: true, reward: result.reward, wallet: await fresh(userId, now) };
    },

    async gamePlayed(userIds, now) {
      const today = dayKey(now);
      const plays = (await configs(prisma, true)).filter((t) => t.type === 'play');
      for (const userId of userIds) {
        const id = BigInt(userId);
        await prisma.$transaction(async (tx) => {
          await tx.user.updateMany({ where: { id, adFree: false }, data: { gamesSinceAd: { increment: 1 } } });
          for (const task of plays) {
            await tx.taskProgress.upsert({
              where: { userId_taskId_day: { userId: id, taskId: task.id, day: today } },
              create: { userId: id, taskId: task.id, day: today, count: 1 },
              update: { count: { increment: 1 } },
            });
          }
        });
        await rewardReferral(userId);
      }
    },

    async grantPurchase({ chargeId, userId, product, stars }, now) {
      const what = starsProduct(product);
      try {
        await prisma.$transaction(async (tx) => {
          await lock(tx, userId);
          await tx.purchase.create({ data: { id: chargeId, userId: BigInt(userId), product, stars, createdAt: new Date(now) } });
          if (what.coins > 0) await credit(tx, userId, what.coins, 'stars', product, `stars:${chargeId}`);
          if (what.adFree) await tx.user.update({ where: { id: BigInt(userId) }, data: { adFree: true, gamesSinceAd: 0 } });
        });
        return true;
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },

    async revokePurchase(chargeId, now) {
      const purchase = await prisma.purchase.findUnique({ where: { id: chargeId } });
      if (!purchase || purchase.refundedAt) return false;
      const userId = Number(purchase.userId);
      const what = starsProduct(purchase.product as StarsProduct);
      await prisma.$transaction(async (tx) => {
        await lock(tx, userId);
        await tx.purchase.update({ where: { id: chargeId }, data: { refundedAt: new Date(now) } });
        if (what.coins > 0) {
          const { coins } = await tx.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { coins: true } });
          const take = Math.min(coins, what.coins);
          if (take > 0) await credit(tx, userId, -take, 'refund', purchase.product, `refund:${chargeId}`);
        }
        if (what.adFree) await tx.user.update({ where: { id: purchase.userId }, data: { adFree: false } });
      });
      return true;
    },

    async looks(ids) {
      if (ids.length === 0) return new Map();
      const rows = await prisma.user.findMany({
        where: { id: { in: ids.map((id) => BigInt(id)) } },
        select: { id: true, glow: true, reactionPack: true },
      });
      return new Map(rows.map((r) => [Number(r.id), { glow: isGlow(r.glow) ? r.glow : 'none', pack: isPack(r.reactionPack) ? r.reactionPack : 'base' }]));
    },

    async topicAccess(userId, topic) {
      const id = BigInt(userId);
      const owned = await prisma.owned.findUnique({ where: { userId_kind_item: { userId: id, kind: 'topic', item: topic } } });
      if (owned) return 'owned';
      const pass = await prisma.topicPass.findFirst({ where: { userId: id, topic, usedAt: null }, select: { id: true } });
      return pass ? 'pass' : 'locked';
    },

    async ownedTopics(userId) {
      const rows = await prisma.owned.findMany({ where: { userId: BigInt(userId), kind: 'topic' }, select: { item: true } });
      return rows.map((r) => r.item).filter(isPremiumTopic);
    },

    async useTopic(userId, topic, gameId, now) {
      const id = BigInt(userId);
      const owned = await prisma.owned.findUnique({ where: { userId_kind_item: { userId: id, kind: 'topic', item: topic } } });
      if (owned) return true;
      // Повтор (рестарт, повторное событие) того же gameId билет второй раз не тратит.
      if (await prisma.topicPass.findFirst({ where: { userId: id, gameId }, select: { id: true } })) return true;
      const pass = await prisma.topicPass.findFirst({ where: { userId: id, topic, usedAt: null }, orderBy: { id: 'asc' } });
      if (!pass) return false;
      const done = await prisma.topicPass.updateMany({ where: { id: pass.id, usedAt: null }, data: { usedAt: new Date(now), gameId } });
      return done.count === 1;
    },

    async ownsPack(userId, pack) {
      if (pack === 'base') return true;
      const row = await prisma.owned.findUnique({ where: { userId_kind_item: { userId: BigInt(userId), kind: 'pack', item: pack } } });
      return Boolean(row);
    },
  };

  /** Друг, пришедший по ссылке, сыграл первую партию: монеты ему и пригласившему (один раз). */
  async function rewardReferral(userId: number) {
    const id = BigInt(userId);
    const user = await prisma.user.findUnique({ where: { id }, select: { referrerId: true, refRewarded: true } });
    if (!user?.referrerId || user.refRewarded) return;
    const inviterId = Number(user.referrerId);
    const invite = (await configs(prisma, true)).find((t) => t.type === 'invite');
    const inviterReward = invite?.reward ?? REFERRAL.inviter;
    try {
      await prisma.$transaction(async (tx) => {
        const done = await tx.user.updateMany({ where: { id, refRewarded: false }, data: { refRewarded: true } });
        if (done.count === 0) return;
        await lock(tx, inviterId);
        await credit(tx, inviterId, inviterReward, 'invite', String(userId), `invite:${inviterId}:${userId}`);
        await lock(tx, userId);
        await credit(tx, userId, REFERRAL.friend, 'friend', String(inviterId), `friend:${userId}`);
      });
    } catch (error) {
      if (!isUniqueViolation(error) && !(error instanceof Refusal)) throw error;
    }
  }
}
