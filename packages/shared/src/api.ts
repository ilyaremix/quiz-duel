import type { Lang, LangSetting } from './lang.js';
import type { Category, GameCategory } from './categories.js';
import type { GameMode } from './game.js';
import type { Outcome } from './elo.js';

/** Заголовок авторизации: `Authorization: tma <initData>`. */
export const AUTH_SCHEME = 'tma';

export type MotionSetting = 'auto' | 'on' | 'off';

/** Документы, которые игрок принимает перед первой партией. */
export type ConsentDoc = 'terms' | 'privacy';
export const CONSENT_DOCS: readonly ConsentDoc[] = ['terms', 'privacy'];

export interface DocsInfo {
  /** Текущая версия текстов, например "2026-11-06". Новая версия - игрок снова видит галочки. */
  version: string;
  termsUrl: string;
  privacyUrl: string;
}

/** GET /api/config - публичные настройки, нужны и вне Telegram. */
export interface ConfigResponse {
  botUsername: string;
  appShortName: string;
  /** Прямая ссылка на мини-апп: https://t.me/<bot>/<app> */
  appUrl: string;
  docs: DocsInfo;
}

/** POST /api/consents - игрок принял документы версии version. */
export interface ConsentRequest {
  docs: ConsentDoc[];
  version: string;
}

export interface ConsentResponse {
  ok: true;
  docsVersion: string;
}

/** GET /api/me - профиль текущего игрока. */
export interface MeResponse {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  /** Настройка языка из профиля. */
  language: LangSetting;
  /** Итоговый язык с учётом настройки и language_code из Telegram. */
  lang: Lang;
  reducedMotion: MotionSetting;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Принял ли игрок текущую версию документов. Без этого создать игру или войти в неё нельзя. */
  docsAccepted: boolean;
  /** Время сервера в мс, клиент по нему считает смещение часов. */
  serverNow: number;
}

/** GET /api/health */
export interface HealthResponse {
  ok: boolean;
  db: boolean;
  uptimeSec: number;
}

/** Коды ошибок REST и сокета. */
export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_init_data'
  | 'rate_limited'
  | 'not_found'
  | 'bad_request'
  | 'stale_version'
  | 'internal';

export interface ApiError {
  error: ApiErrorCode;
  /** Уточнение, например причина отказа initData. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Этап 7: профиль, история, лидерборд, разбор

/** В лидерборд попадают игроки, сыгравшие столько рейтинговых партий. */
export const LEADERBOARD_MIN_GAMES = 5;
/** Сколько игроков в лидерборде. */
export const LEADERBOARD_SIZE = 100;

/** Игрок в списках: лидерборд, история, профиль соперника. */
export interface PlayerBrief {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  rating: number;
}

/** Цифры игрока по рейтинговым дуэлям. */
export interface PlayerStats {
  rating: number;
  /** Место в лидерборде; null - меньше 5 партий, в рейтинге пока не участвует. */
  place: number | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  /** Сыграно вопросов и из них верно - точность. */
  questionsPlayed: number;
  correct: number;
  /** Среднее время верного ответа (мс); null - верных ещё не было. */
  avgCorrectMs: number | null;
}

export interface CategoryStatView {
  category: Category;
  answered: number;
  correct: number;
  wins: number;
}

/** Строка истории матчей. */
export interface MatchSummary {
  gameId: string;
  mode: GameMode;
  category: GameCategory;
  opponent: PlayerBrief;
  myScore: number;
  oppScore: number;
  outcome: Outcome;
  technical: boolean;
  /** Моё изменение рейтинга; null - итоги ещё считаются. */
  ratingDelta: number | null;
  finishedAt: number;
}

/** GET /api/profile - мой профиль. */
export interface ProfileResponse {
  me: PlayerBrief;
  stats: PlayerStats;
  categories: CategoryStatView[];
  /** Последние матчи, новые сверху (до 20). */
  matches: MatchSummary[];
  /** Сколько ачивок получено (экран ачивок - этап 8). */
  achievements: number;
}

/** Личный счёт встреч. */
export interface HeadToHead {
  /** Мои победы. */
  me: number;
  /** Победы соперника. */
  opp: number;
  draws: number;
  /** Всего партий друг с другом. */
  games: number;
  /** Когда была последняя (мс). */
  lastAt: number | null;
}

/** GET /api/players/:id - профиль соперника (только того, с кем вы уже играли). */
export interface PlayerResponse {
  player: PlayerBrief;
  stats: PlayerStats;
  headToHead: HeadToHead;
}

export interface LeaderRowView {
  place: number;
  player: PlayerBrief;
  games: number;
}

/** GET /api/leaderboard - топ-100 и моя строка. */
export interface LeaderboardResponse {
  top: LeaderRowView[];
  me: {
    place: number | null;
    rating: number;
    games: number;
    /** Сколько партий не хватает до попадания в рейтинг. */
    gamesToQualify: number;
  };
}

export interface ReviewSide {
  /** Позиция на экране; null - не успел. */
  position: number | null;
  correct: boolean;
  timeMs: number | null;
  points: number;
}

export interface ReviewQuestion {
  index: number;
  category: Category;
  text: string;
  /** Варианты в порядке, в котором их видели игроки. */
  options: string[];
  correctPosition: number;
  me: ReviewSide;
  opp: ReviewSide;
}

/** GET /api/games/:id/review - разбор завершённой партии (только участникам). */
export interface ReviewResponse {
  gameId: string;
  category: GameCategory;
  outcome: Outcome;
  technical: boolean;
  myScore: number;
  oppScore: number;
  opponent: PlayerBrief;
  me: PlayerBrief;
  /** Только сыгранные (закрытые) вопросы; при технической победе их меньше 10. */
  questions: ReviewQuestion[];
}
