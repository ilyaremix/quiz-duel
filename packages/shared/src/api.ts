import type { Lang, LangSetting } from './lang.js';

/** Заголовок авторизации: `Authorization: tma <initData>`. */
export const AUTH_SCHEME = 'tma';

export type MotionSetting = 'auto' | 'on' | 'off';

/** GET /api/config - публичные настройки, нужны и вне Telegram. */
export interface ConfigResponse {
  botUsername: string;
  appShortName: string;
  /** Прямая ссылка на мини-апп: https://t.me/<bot>/<app> */
  appUrl: string;
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
  | 'internal';

export interface ApiError {
  error: ApiErrorCode;
  /** Уточнение, например причина отказа initData. */
  reason?: string;
}
