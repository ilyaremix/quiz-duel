/**
 * Ссылки на партию. Формат по ТЗ: https://t.me/<bot>/<app>?startapp=g_<gameId>,
 * gameId - 10 случайных символов [A-Za-z0-9] (Telegram разрешает в startapp A-Z, a-z, 0-9, _ и -).
 */
export const GAME_ID_LENGTH = 10;
export const GAME_ID_RE = /^[A-Za-z0-9]{10}$/;
const START_PREFIX = 'g_';

export const isGameId = (value: unknown): value is string => typeof value === 'string' && GAME_ID_RE.test(value);

/** start_param для партии. */
export const gameStartParam = (gameId: string) => `${START_PREFIX}${gameId}`;

/** Полная ссылка-приглашение. appUrl - https://t.me/<bot>/<app> из /api/config. */
export const gameLink = (appUrl: string, gameId: string) => `${appUrl}?startapp=${gameStartParam(gameId)}`;

/** gameId из start_param или null, если параметр не про партию. */
export function gameIdFromStartParam(startParam: string | null | undefined): string | null {
  if (!startParam?.startsWith(START_PREFIX)) return null;
  const id = startParam.slice(START_PREFIX.length);
  return GAME_ID_RE.test(id) ? id : null;
}
