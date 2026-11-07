import { signInitData, type TelegramUser } from '../src/auth/initData.js';
import { resolveLang } from '@quiz-duel/shared';
import { settingsOf, telegramProfile, type ConsentInput, type UserCard, type UserRecord, type UsersRepo } from '../src/users.js';
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

export const DOCS_VERSION = '2026-11-07';

/** Хранилище игроков в памяти: тестам HTTP и сокета база не нужна. */
export function memoryUsers(): UsersRepo & { rows: Map<number, UserRecord>; consents: ConsentInput[] } {
  const rows = new Map<number, UserRecord>();
  const consents: ConsentInput[] = [];
  return {
    rows,
    consents,
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
        docsVersion: null,
        notifications: true,
        writeAccess: false,
        ...existing,
        firstName: profile.firstName,
        lastName: profile.lastName,
        username: profile.username,
        photoUrl: profile.photoUrl,
        tgLanguage: profile.tgLanguage,
      };
      if (user.allows_write_to_pm === true) record.writeAccess = true;
      rows.set(user.id, record);
      return record;
    },
    async cards(ids) {
      const out = new Map<number, UserCard>();
      for (const id of ids) {
        const r = rows.get(id);
        if (!r) continue;
        out.set(id, {
          id,
          name: r.firstName,
          username: r.username,
          photoUrl: r.photoUrl,
          rating: r.rating,
          lang: resolveLang(r.language, r.tgLanguage),
          docsVersion: r.docsVersion,
        });
      }
      return out;
    },
    async acceptDocs(input) {
      consents.push(input);
      const r = rows.get(input.userId);
      if (r) r.docsVersion = input.version;
    },
    async ping() {
      return true;
    },
    async alertTarget(id) {
      const r = rows.get(id);
      return r ? { id, lang: resolveLang(r.language, r.tgLanguage), notifications: r.notifications, writeAccess: r.writeAccess } : null;
    },
    async setWriteAccess(id, allowed) {
      const r = rows.get(id);
      if (r) r.writeAccess = allowed;
    },
    async updateSettings(id, patch) {
      const r = rows.get(id);
      if (!r) return null;
      Object.assign(r, patch);
      return settingsOf(r);
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
    DOCS_VERSION,
    TERMS_URL: 'https://telegra.ph/Quiz-Duel---Terms-of-Use-11-06',
    PRIVACY_URL: 'https://telegra.ph/Quiz-Duel---Privacy-Policy-11-06',
  };
}
