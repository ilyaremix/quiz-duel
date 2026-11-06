import { signInitData, type TelegramUser } from '../src/auth/initData.js';
import { telegramProfile, type UserRecord, type UsersRepo } from '../src/users.js';
import type { AppDeps } from '../src/http/app.js';

export const BOT_TOKEN = '1234567890:AAH-test-token-for-unit-tests-only_xyz';

export const ilya: TelegramUser = {
  id: 100500,
  first_name: 'Илья',
  username: 'ilya',
  language_code: 'ru',
  photo_url: 'https://t.me/i/userpic/320/ilya.jpg',
};

/** initData, подписанный тем же способом, что и Telegram. */
export function makeInitData(
  options: { user?: TelegramUser | null; authDateSec?: number; token?: string; extra?: Record<string, string> } = {},
): string {
  const fields: Record<string, string> = {
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    auth_date: String(options.authDateSec ?? Math.floor(Date.now() / 1000)),
    signature: 'test-signature-field',
    ...options.extra,
  };
  if (options.user !== null && fields.user === undefined) fields.user = JSON.stringify(options.user ?? ilya);
  return signInitData(fields, options.token ?? BOT_TOKEN);
}

/** Хранилище игроков в памяти: тестам HTTP и сокета база не нужна. */
export function memoryUsers(): UsersRepo & { rows: Map<number, UserRecord> } {
  const rows = new Map<number, UserRecord>();
  return {
    rows,
    async upsertFromTelegram(user) {
      const profile = telegramProfile(user);
      const existing = rows.get(user.id);
      const record: UserRecord = {
        id: user.id,
        language: 'auto',
        reducedMotion: 'auto',
        rating: 1000,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        ...existing,
        firstName: profile.firstName,
        lastName: profile.lastName,
        username: profile.username,
        photoUrl: profile.photoUrl,
        tgLanguage: profile.tgLanguage,
      };
      rows.set(user.id, record);
      return record;
    },
    async ping() {
      return true;
    },
  };
}

export function testEnv(): AppDeps['env'] {
  return {
    BOT_TOKEN,
    INIT_DATA_MAX_AGE_SEC: 86_400,
    WEB_APP_URL: 'https://quiz.example.sslip.io',
    APP_SHORT_NAME: 'play',
    TRUST_PROXY: '127.0.0.1',
    LOG_LEVEL: 'silent',
  };
}
