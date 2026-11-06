import {
  resolveLang,
  type ConsentDoc,
  type Lang,
  type LangSetting,
  type MeResponse,
  type MotionSetting,
  type PlayerProfile,
} from '@quiz-duel/shared';
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
  /** Последняя принятая версия документов; null - ещё не принимал. */
  docsVersion: string | null;
}

/** Что нужно игровому серверу об игроке: карточка для соперника, язык вопросов и согласие. */
export interface UserCard extends PlayerProfile {
  id: number;
  lang: Lang;
  docsVersion: string | null;
}

export interface ConsentInput {
  userId: number;
  docs: ConsentDoc[];
  version: string;
  ip: string | null;
  userAgent: string | null;
}

export interface UsersRepo {
  /** Создаёт игрока при первом входе, при следующих - обновляет имя, фото и язык из Telegram. */
  upsertFromTelegram(user: TelegramUser): Promise<UserRecord>;
  /** Карточки игроков по id (кого нет в базе - того нет в ответе). */
  cards(ids: readonly number[]): Promise<Map<number, UserCard>>;
  /** Записывает принятие документов в журнал consents и запоминает версию у игрока. */
  acceptDocs(input: ConsentInput): Promise<void>;
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
        docsVersion: row.docsVersion,
      };
    },
    async cards(ids) {
      if (ids.length === 0) return new Map();
      const rows = await prisma.user.findMany({ where: { id: { in: ids.map((id) => BigInt(id)) } } });
      return new Map(
        rows.map((row) => {
          const id = Number(row.id);
          const card: UserCard = {
            id,
            name: row.firstName,
            username: row.username,
            photoUrl: row.photoUrl,
            rating: row.rating,
            lang: resolveLang(row.language, row.tgLanguage),
            docsVersion: row.docsVersion,
          };
          return [id, card];
        }),
      );
    },
    async acceptDocs({ userId, docs, version, ip, userAgent }) {
      const id = BigInt(userId);
      // Журнал и версия у игрока меняются вместе: либо оба, либо ничего.
      await prisma.$transaction([
        prisma.consent.createMany({
          data: docs.map((doc) => ({ userId: id, doc, docVersion: version, ip, userAgent })),
        }),
        prisma.user.update({ where: { id }, data: { docsVersion: version } }),
      ]);
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

export function toMeResponse(user: UserRecord, docsVersion: string, serverNow = Date.now()): MeResponse {
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
    docsAccepted: user.docsVersion === docsVersion,
    serverNow,
  };
}
