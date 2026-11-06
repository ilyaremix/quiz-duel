import { resolveLang, type LangSetting, type MeResponse, type MotionSetting } from '@quiz-duel/shared';
import type { PrismaClient } from './generated/prisma/client.js';
import type { TelegramUser } from './auth/initData.js';

/** Игрок в том виде, в каком он нужен приложению (без типов Prisma). */
export interface UserRecord {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  tgLanguage: string | null;
  language: LangSetting;
  reducedMotion: MotionSetting;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface UsersRepo {
  /** Создаёт игрока при первом входе, при следующих - обновляет имя, фото и язык из Telegram. */
  upsertFromTelegram(user: TelegramUser): Promise<UserRecord>;
  /** Жива ли база (для /api/health). */
  ping(): Promise<boolean>;
}

/** Длины как в Telegram, плюс запас; защищает базу от мусора в initData. */
function clip(value: string | undefined, max: number): string | null {
  if (value === undefined || value === '') return null;
  return value.length > max ? value.slice(0, max) : value;
}

export function telegramProfile(user: TelegramUser) {
  return {
    firstName: clip(user.first_name, 128) ?? '',
    lastName: clip(user.last_name, 128),
    username: clip(user.username, 64),
    photoUrl: user.photo_url?.startsWith('https://') ? clip(user.photo_url, 512) : null,
    tgLanguage: clip(user.language_code, 16),
    isPremium: user.is_premium === true,
  };
}

export function createPrismaUsersRepo(prisma: PrismaClient): UsersRepo {
  return {
    async upsertFromTelegram(user) {
      const profile = telegramProfile(user);
      const row = await prisma.user.upsert({
        where: { id: BigInt(user.id) },
        create: { id: BigInt(user.id), ...profile },
        update: { ...profile, lastSeenAt: new Date() },
      });
      return {
        id: Number(row.id),
        firstName: row.firstName,
        lastName: row.lastName,
        username: row.username,
        photoUrl: row.photoUrl,
        tgLanguage: row.tgLanguage,
        language: row.language,
        reducedMotion: row.reducedMotion,
        rating: row.rating,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
      };
    },
    async ping() {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function toMeResponse(user: UserRecord, serverNow = Date.now()): MeResponse {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    language: user.language,
    lang: resolveLang(user.language, user.tgLanguage),
    reducedMotion: user.reducedMotion,
    rating: user.rating,
    games: user.games,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    serverNow,
  };
}
