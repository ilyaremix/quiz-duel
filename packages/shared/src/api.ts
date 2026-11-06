import type { Lang, LangSetting } from './lang.js';

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
