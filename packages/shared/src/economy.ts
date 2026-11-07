/**
 * Обновление 2.0: монеты, магазин, задания, реклама и оплата звёздами.
 * Цены и награды - одни на сервер и приложение (сервер проверяет всё сам).
 */

// ---------------------------------------------------------------------------
// Товары за монеты

/** Свечение аватарки: видят соперники в лобби, на VS, в партии и в рейтинге. */
export const GLOWS = ['none', 'neon', 'gold', 'ice', 'rainbow', 'fire'] as const;
export type GlowId = (typeof GLOWS)[number];

/** Наборы реакций: базовый бесплатный, остальные за монеты. */
export const PACKS = ['base', 'bold', 'warm', 'party'] as const;
export type PackId = (typeof PACKS)[number];

export const GLOW_PRICES: Readonly<Record<GlowId, number>> = { none: 0, neon: 300, gold: 500, ice: 600, rainbow: 800, fire: 1200 };
export const PACK_PRICES: Readonly<Record<PackId, number>> = { base: 0, bold: 400, warm: 400, party: 600 };

export const REACTION_PACKS: Readonly<Record<PackId, readonly string[]>> = {
  base: ['👍', '😂', '😮', '😤', '🔥', '👏'],
  bold: ['😎', '🤡', '💀', '🫡', '🥶', '🤯'],
  warm: ['😍', '🥰', '💖', '🤝', '🙏', '🥹'],
  party: ['🎉', '🥳', '🍾', '🎯', '🧠', '👑'],
};

/** Все реакции, какие вообще бывают (проверка входящего события). */
export const ALL_REACTIONS: readonly string[] = PACKS.flatMap((p) => REACTION_PACKS[p]);

/** Платные темы: на 1 игру за рекламу или навсегда за монеты. */
export const PREMIUM_TOPICS = ['games', 'space', 'food', 'crypto'] as const;
export type PremiumTopic = (typeof PREMIUM_TOPICS)[number];
export const TOPIC_PRICE = 1000;

export type ShopKind = 'glow' | 'pack' | 'topic';

export const isGlow = (v: unknown): v is GlowId => typeof v === 'string' && (GLOWS as readonly string[]).includes(v);
export const isPack = (v: unknown): v is PackId => typeof v === 'string' && (PACKS as readonly string[]).includes(v);
export const isPremiumTopic = (v: unknown): v is PremiumTopic =>
  typeof v === 'string' && (PREMIUM_TOPICS as readonly string[]).includes(v);

/** Цена товара в монетах; null - такого товара нет. */
export function priceOf(kind: ShopKind, item: string): number | null {
  if (kind === 'glow') return isGlow(item) ? GLOW_PRICES[item] : null;
  if (kind === 'pack') return isPack(item) ? PACK_PRICES[item] : null;
  return isPremiumTopic(item) ? TOPIC_PRICE : null;
}

// ---------------------------------------------------------------------------
// Звёзды Telegram

export const COIN_PACKS = [
  { id: 's', coins: 300, stars: 25 },
  { id: 'm', coins: 1000, stars: 75, best: true },
  { id: 'l', coins: 2500, stars: 150, bonus: 25 },
] as const;
export type CoinPackId = (typeof COIN_PACKS)[number]['id'];

export const AD_FREE_STARS = 100;

export type StarsProduct = 'coins_s' | 'coins_m' | 'coins_l' | 'adfree';
export const STARS_PRODUCTS: readonly StarsProduct[] = ['coins_s', 'coins_m', 'coins_l', 'adfree'];

export const isStarsProduct = (v: unknown): v is StarsProduct =>
  typeof v === 'string' && (STARS_PRODUCTS as readonly string[]).includes(v);

/** Сколько звёзд стоит и что даёт покупка. */
export function starsProduct(product: StarsProduct): { stars: number; coins: number; adFree: boolean } {
  if (product === 'adfree') return { stars: AD_FREE_STARS, coins: 0, adFree: true };
  const pack = COIN_PACKS.find((p) => `coins_${p.id}` === product)!;
  return { stars: pack.stars, coins: pack.coins, adFree: false };
}

// ---------------------------------------------------------------------------
// Награды

/** Серия входа: день 1..7 и по кругу; пропуск дня - серия заново. */
export const STREAK_REWARDS = [10, 20, 30, 40, 50, 70, 100] as const;

/** Награда за день серии (series - номер дня подряд, с 1). */
export function streakReward(series: number): number {
  return STREAK_REWARDS[(Math.max(1, series) - 1) % STREAK_REWARDS.length]!;
}

/** Реклама: обязательный ролик после каждых 3 партий, длина ролика, допуск на сеть. */
export const ADS = { every: 3, sec: 15, graceMs: 1500, ttlMs: 10 * 60_000 } as const;

/** Пригласившему и приглашённому - когда друг сыграет первую партию. */
export const REFERRAL = { inviter: 100, friend: 50 } as const;

// ---------------------------------------------------------------------------
// Дни: границы суток по Москве (основная аудитория), одни для серии и ежедневных заданий

export const DAY_OFFSET_MS = 3 * 3600_000;

/** День в виде YYYY-MM-DD. */
export function dayKey(ms: number): string {
  return new Date(ms + DAY_OFFSET_MS).toISOString().slice(0, 10);
}

/** Предыдущий день. */
export function prevDayKey(ms: number): string {
  return dayKey(ms - 86_400_000);
}

/** Когда начнутся следующие сутки (мс). */
export function nextDayStart(ms: number): number {
  const shifted = ms + DAY_OFFSET_MS;
  return shifted - (shifted % 86_400_000) + 86_400_000 - DAY_OFFSET_MS;
}

// ---------------------------------------------------------------------------
// Задания

export type TaskType = 'channel' | 'play' | 'ads' | 'story' | 'invite';
export type TaskFreq = 'once' | 'daily' | 'perFriend';
export const TASK_TYPES: readonly TaskType[] = ['channel', 'play', 'ads', 'story', 'invite'];
export const TASK_FREQS: readonly TaskFreq[] = ['once', 'daily', 'perFriend'];

/** Частота задания определяется типом: так награду нельзя случайно сделать бесконечной. */
export const FREQ_OF: Readonly<Record<TaskType, TaskFreq>> = {
  channel: 'once',
  play: 'daily',
  ads: 'daily',
  story: 'once',
  invite: 'perFriend',
};

export interface TaskConfigView {
  id: string;
  type: TaskType;
  channel: string | null;
  goal: number;
  reward: number;
  freq: TaskFreq;
  on: boolean;
  sort: number;
}

/** Задания при первом запуске: дальше их меняет админка. */
export const DEFAULT_TASKS: readonly TaskConfigView[] = [
  { id: 'play', type: 'play', channel: null, goal: 3, reward: 30, freq: 'daily', on: true, sort: 10 },
  { id: 'ads', type: 'ads', channel: null, goal: 5, reward: 15, freq: 'daily', on: true, sort: 20 },
  { id: 'channel', type: 'channel', channel: '@aid_crypto', goal: 1, reward: 100, freq: 'once', on: true, sort: 30 },
  { id: 'story', type: 'story', channel: null, goal: 1, reward: 150, freq: 'once', on: true, sort: 40 },
  { id: 'invite', type: 'invite', channel: null, goal: 1, reward: REFERRAL.inviter, freq: 'perFriend', on: true, sort: 50 },
];

/** Задание у игрока: прогресс за сегодня (ежедневные) или вообще (разовые). */
export interface TaskView {
  id: string;
  type: TaskType;
  freq: TaskFreq;
  channel: string | null;
  goal: number;
  reward: number;
  /** Сделано: партий/роликов сегодня, для разовых 0 или 1, для друзей - приглашено. */
  count: number;
  /** Награда уже получена (сегодня - для ежедневных). */
  claimed: boolean;
  /** Можно нажать «Забрать». */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Ответы API

export interface DailyView {
  /** День серии 1..7 (сегодняшний: забранный или тот, что можно забрать). */
  day: number;
  /** Дней подряд (с сегодняшним, если забран). */
  series: number;
  claimed: boolean;
  /** Сколько даст (или дал) сегодняшний день. */
  reward: number;
}

export interface WalletResponse {
  coins: number;
  adFree: boolean;
  glow: GlowId;
  pack: PackId;
  owned: { glow: GlowId[]; pack: PackId[]; topic: PremiumTopic[] };
  /** Темы на 1 игру (за рекламу), ещё не сыгранные. */
  passes: PremiumTopic[];
  daily: DailyView;
  tasks: TaskView[];
  /** Когда обновятся ежедневные задания и серия. */
  resetAt: number;
  /** Пора показать обязательный ролик (после 3 партий). */
  adDue: boolean;
  /** Telegram Premium: для задания с историей. */
  premium: boolean;
}

export type EconomyErrorCode =
  | 'not_found'
  | 'already_claimed'
  | 'not_ready'
  | 'no_coins'
  | 'owned'
  | 'not_owned'
  | 'bad_item'
  | 'not_subscribed'
  | 'cannot_verify'
  | 'premium_only'
  | 'limit'
  | 'too_early'
  | 'expired'
  | 'ad_free';

export interface ClaimResponse {
  wallet: WalletResponse;
  /** Сколько монет начислено. */
  reward: number;
}

export interface BuyRequest {
  kind: ShopKind;
  item: string;
}

export interface EquipRequest {
  kind: 'glow' | 'pack';
  item: string;
}

export type AdPurpose = 'forced' | 'reward' | 'topic';

export interface AdStartRequest {
  purpose: AdPurpose;
  topic?: PremiumTopic;
}

export interface AdStartResponse {
  id: string;
  /** Сколько секунд смотреть. */
  sec: number;
  /** Адрес ролика. */
  src: string;
}

export interface AdDoneResponse {
  wallet: WalletResponse;
  reward: number;
}

export interface InvoiceRequest {
  product: StarsProduct;
}

export interface InvoiceResponse {
  url: string;
}
