import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';
import { AUTH_SCHEME } from '@quiz-duel/shared';
import { InitDataError, verifyInitData, type VerifiedInitData } from './initData.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Проверенный initData. Заполняется только хуком requireTelegramAuth. */
    tg: VerifiedInitData | null;
  }
}

/** Достаёт initData из заголовка `Authorization: tma <initData>`. */
export function readInitDataHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const space = header.indexOf(' ');
  if (space <= 0) return undefined;
  if (header.slice(0, space).toLowerCase() !== AUTH_SCHEME) return undefined;
  return header.slice(space + 1).trim() || undefined;
}

/**
 * Хук для защищённых маршрутов: без верного initData запрос дальше не идёт.
 * Ошибку превращает в ответ общий обработчик (см. http/app.ts).
 */
export function requireTelegramAuth(botToken: string, maxAgeSec: number): onRequestHookHandler {
  return async function telegramAuth(request: FastifyRequest, _reply: FastifyReply) {
    const raw = readInitDataHeader(request.headers.authorization);
    request.tg = verifyInitData(raw, botToken, { maxAgeSec });
  };
}

export function authErrorBody(error: InitDataError) {
  return error.reason === 'missing' ? { error: 'unauthorized' as const } : { error: 'invalid_init_data' as const, reason: error.reason };
}
