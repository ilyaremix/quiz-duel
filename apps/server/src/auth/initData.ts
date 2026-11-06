import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка initData мини-аппа по документации Telegram:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
 * hash       = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
 * data_check_string - все поля, кроме hash, по алфавиту, "ключ=значение" через \n.
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: Date;
  startParam: string | null;
  queryId: string | null;
}

export type InitDataFailure =
  | 'missing'
  | 'malformed'
  | 'bad_hash'
  | 'expired'
  | 'from_future'
  | 'no_user';

export class InitDataError extends Error {
  constructor(readonly reason: InitDataFailure) {
    super(`initData rejected: ${reason}`);
    this.name = 'InitDataError';
  }
}

export interface VerifyOptions {
  /** Максимальный возраст auth_date в секундах (ТЗ: 24 часа). */
  maxAgeSec: number;
  /** Текущее время в мс, подменяется в тестах. */
  now?: number;
}

/** Допуск на расхождение часов сервера и Telegram. */
const FUTURE_SKEW_SEC = 300;
/** Защита от гигантских заголовков: настоящий initData - 1-2 КБ. */
const MAX_RAW_LENGTH = 8 * 1024;

const secretCache = new Map<string, Buffer>();

function secretKey(botToken: string): Buffer {
  let key = secretCache.get(botToken);
  if (!key) {
    key = createHmac('sha256', 'WebAppData').update(botToken).digest();
    secretCache.set(botToken, key);
  }
  return key;
}

function dataCheckString(params: Map<string, string>): string {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function parseParams(raw: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(raw)) {
    // Повтор ключа - попытка подсунуть второе значение, такой initData не принимаем.
    if (params.has(key)) throw new InitDataError('malformed');
    params.set(key, value);
  }
  return params;
}

function parseUser(json: string | undefined): TelegramUser {
  if (!json) throw new InitDataError('no_user');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new InitDataError('malformed');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !Number.isSafeInteger((value as TelegramUser).id) ||
    (value as TelegramUser).id <= 0 ||
    typeof (value as TelegramUser).first_name !== 'string'
  ) {
    throw new InitDataError('no_user');
  }
  return value as TelegramUser;
}

/**
 * Проверяет подпись и свежесть initData. Возвращает данные только если
 * подпись верна; иначе бросает InitDataError с причиной.
 * userId дальше берётся только из результата этой функции.
 */
export function verifyInitData(raw: string | undefined | null, botToken: string, options: VerifyOptions): VerifiedInitData {
  if (!raw) throw new InitDataError('missing');
  if (raw.length > MAX_RAW_LENGTH) throw new InitDataError('malformed');

  const params = parseParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) throw new InitDataError('malformed');

  const expected = createHmac('sha256', secretKey(botToken)).update(dataCheckString(params)).digest();
  const received = Buffer.from(hash, 'hex');
  if (!timingSafeEqual(expected, received)) throw new InitDataError('bad_hash');

  // Время проверяем после подписи: до неё поле auth_date ничего не значит.
  const authDateSec = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDateSec) || authDateSec <= 0) throw new InitDataError('malformed');
  const nowSec = Math.floor((options.now ?? Date.now()) / 1000);
  if (authDateSec > nowSec + FUTURE_SKEW_SEC) throw new InitDataError('from_future');
  if (nowSec - authDateSec > options.maxAgeSec) throw new InitDataError('expired');

  return {
    user: parseUser(params.get('user')),
    authDate: new Date(authDateSec * 1000),
    startParam: params.get('start_param') ?? null,
    queryId: params.get('query_id') ?? null,
  };
}

/**
 * Подписывает initData так же, как это делает Telegram.
 * Нужна тестам и локальной отладке; в рабочем коде не используется.
 */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new Map(Object.entries(fields));
  params.delete('hash');
  const hash = createHmac('sha256', secretKey(botToken)).update(dataCheckString(params)).digest('hex');
  const search = new URLSearchParams([...params.entries()]);
  search.set('hash', hash);
  return search.toString();
}
