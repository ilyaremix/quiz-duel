/**
 * Обновление 2.0: админка и аналитика. Видят только админы (ADMIN_IDS на сервере).
 * Все цифры считает сервер по своим таблицам: дни активности, события, источники, покупки, реклама.
 */
import type { GlowId, StarsProduct, TaskConfigView } from './economy.js';
import type { Variant } from './game.js';

/** События, которые приложение шлёт в аналитику: экраны и кнопки. Остальные сервер не примет. */
export const EVENT_NAMES = {
  screen: ['home', 'friends', 'shop', 'rating', 'profile', 'settings', 'lobby', 'question', 'results', 'review', 'admin'],
  btn: [
    'quick',
    'create',
    'solo',
    'rematch',
    'share',
    'invite',
    'challenge',
    'daily',
    'adWatch',
    'adDone',
    'adSkip',
    'taskCh',
    'taskStory',
    'buyGlow',
    'buyPack',
    'buyTopic',
    'buyCoins',
    'buyAdFree',
  ],
} as const;
export type ScreenEvent = (typeof EVENT_NAMES.screen)[number];
export type ButtonEvent = (typeof EVENT_NAMES.btn)[number];
export type EventName = ScreenEvent | ButtonEvent;
export const ALL_EVENT_NAMES: readonly string[] = [...EVENT_NAMES.screen, ...EVENT_NAMES.btn];
export const eventKind = (name: string): 'screen' | 'btn' => ((EVENT_NAMES.screen as readonly string[]).includes(name) ? 'screen' : 'btn');

export interface TrackRequest {
  events: EventName[];
}

export type AdminPeriod = 7 | 30 | 90;

export interface SeriesPoint {
  /** Подпись дня или недели: «06.11». */
  d: string;
  v: number;
}

/** Изменение к прошлому такому же периоду (проценты; null - сравнивать не с чем). */
export type Delta = number | null;

export interface AdminOverview {
  days: AdminPeriod;
  live: { online: number; inGame: number };
  kpi: {
    users: number;
    fresh: number;
    freshD: Delta;
    dau: number;
    dauD: Delta;
    mau: number;
    mauD: Delta;
    /** DAU / MAU, проценты с одной цифрой после запятой. */
    sticky: number;
    stickyD: Delta;
    games: number;
    gamesD: Delta;
  };
  /** По дням (7 и 30 дней) или по неделям в среднем за день (90 дней). */
  dau: SeriesPoint[];
  fresh: SeriesPoint[];
  modes: { id: Variant; n: number; p: number }[];
}

export interface AdminRetention {
  d1: number | null;
  d7: number | null;
  d30: number | null;
  /** Доля активных за день, кто пришёл не в этот день (проценты). */
  returning: number | null;
  /** День после первого входа → процент вернувшихся. */
  curve: [number, number | null][];
  cohorts: { w: string; n: number; v: (number | null)[] }[];
  cohortCols: string[];
  sticky: SeriesPoint[];
}

export interface AdminEvents {
  funnel: { step: 'open' | 'onboard' | 'first' | 'three' | 'back'; n: number }[];
  events: { name: string; kind: 'screen' | 'btn'; count: number; users: number }[];
}

export interface AdminSource {
  /** organic, legacy, ref, duel, inline или код ссылки src_<код>. */
  id: string;
  title: string | null;
  users: number;
  /** Сыграли первую партию (проценты). */
  first: number | null;
  /** Вернулись на 7-й день (проценты, только кому уже 7 дней). */
  d7: number | null;
  stars: number;
  /** Считается сам (рефералы, дуэли) или это ссылка из админки. */
  auto: boolean;
  url: string | null;
}

export interface AdminSources {
  sources: AdminSource[];
  refTop: { id: number; name: string; invited: number }[];
  botUsername: string;
  appUrl: string;
}

export interface AdminMoney {
  kpi: { stars: number; starsD: Delta; buyers: number; buyersD: Delta; arppu: number; adFree: number; activeBuyersShare: number | null };
  stars: SeriesPoint[];
  products: { product: StarsProduct; count: number; stars: number }[];
  ads: { forced: number; forcedDone: number; skipped: number; reward: number; topic: number };
  coins: { earned: number; spent: number; spend: { topics: number; glow: number; packs: number } };
}

export interface AdminTask extends TaskConfigView {
  /** Сколько раз выполнили (забрали награду). */
  done: number;
  /** Канал: бот - админ канала (иначе подписку не проверить); null - не канал или неизвестно. */
  botAdmin: boolean | null;
}

export interface AdminPlayerRow {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  glow: GlowId;
  rating: number;
  games: number;
  coins: number;
  stars: number;
  banned: boolean;
  createdAt: number;
  lastSeenAt: number;
}

export interface AdminPlayer extends AdminPlayerRow {
  wins: number;
  source: string | null;
  purchases: { product: StarsProduct; stars: number; at: number; refunded: boolean }[];
}

export interface AdminTaskSaveRequest {
  id?: string;
  type: TaskConfigView['type'];
  channel: string | null;
  goal: number;
  reward: number;
  on: boolean;
  sort?: number;
  titleRu: string | null;
  titleEn: string | null;
}

export interface AdminLinkRequest {
  code: string;
  title: string;
}
