import {
  isGlow,
  langFromTelegram,
  resolveLang,
  type ConsentDoc,
  type Lang,
  type LangSetting,
  type MeResponse,
  type MotionSetting,
  type ThemeSetting,
  type PlayerProfile,
  type SettingsResponse,
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
  theme: ThemeSetting;
  haptics: boolean;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Последняя принятая версия документов; null - ещё не принимал. */
  docsVersion: string | null;
  /** Заблокирован в админке. */
  banned: boolean;
  notifications: boolean;
  writeAccess: boolean;
  onboarded: boolean;
}

/** Кому и на каком языке бот может написать. */
export interface AlertTarget {
  id: number;
  lang: Lang;
  notifications: boolean;
  writeAccess: boolean;
}

/** Что нужно игровому серверу об игроке: карточка для соперника, язык вопросов и согласие. */
export interface UserCard extends PlayerProfile {
  id: number;
  lang: Lang;
  docsVersion: string | null;
  /** Заблокирован в админке - играть нельзя. */
  banned?: boolean;
}

/** Что меняет POST /api/settings (только переданные поля). */
export interface SettingsPatch {
  notifications?: boolean;
  writeAccess?: boolean;
  language?: LangSetting;
  reducedMotion?: MotionSetting;
  theme?: ThemeSetting;
  haptics?: boolean;
  onboarded?: boolean;
}

/** Настройки из строки игрока в том виде, в каком их отдаёт API. */
export function settingsOf(row: {
  notifications: boolean;
  writeAccess: boolean;
  language: LangSetting;
  tgLanguage: string | null;
  reducedMotion: MotionSetting;
  theme: ThemeSetting;
  haptics: boolean;
  onboarded: boolean;
}): SettingsResponse {
  return {
    notifications: row.notifications,
    writeAccess: row.writeAccess,
    language: row.language,
    lang: resolveLang(row.language, row.tgLanguage),
    autoLang: langFromTelegram(row.tgLanguage),
    reducedMotion: row.reducedMotion,
    theme: row.theme,
    haptics: row.haptics,
    onboarded: row.onboarded,
  };
}

export interface ConsentInput {
  userId: number;
  docs: ConsentDoc[];
  version: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Откуда пришли данные игрока. initData мини-аппа несёт фото (нет поля - фото у игрока нет),
 * а пользователь в обновлениях бота (/start, inline-запрос) фото не несёт никогда:
 * из них фото не трогаем, иначе оно стиралось бы до следующего открытия мини-аппа.
 */
export type ProfileSource = 'miniapp' | 'bot';

export interface UsersRepo {
  /** Создаёт игрока при первом входе, при следующих - обновляет имя, фото (только из мини-аппа) и язык из Telegram. */
  upsertFromTelegram(user: TelegramUser, source?: ProfileSource): Promise<UserRecord>;
  /** Карточки игроков по id (кого нет в базе - того нет в ответе). */
  cards(ids: readonly number[]): Promise<Map<number, UserCard>>;
  /** Записывает принятие документов в журнал consents и запоминает версию у игрока. */
  acceptDocs(input: ConsentInput): Promise<void>;
  /** Жива ли база (для /api/health). */
  ping(): Promise<boolean>;
  /** Язык и разрешения для уведомлений бота; null - игрока нет. */
  alertTarget(id: number): Promise<AlertTarget | null>;
  /** Бот может (или больше не может) писать игроку. */
  setWriteAccess(id: number, allowed: boolean): Promise<void>;
  /** Настройки игрока; возвращает итоговые значения. null - игрока нет. */
  updateSettings(id: number, patch: SettingsPatch): Promise<SettingsResponse | null>;
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
    async upsertFromTelegram(user, source = 'miniapp') {
      const { photoUrl, ...rest } = telegramProfile(user);
      const profile = source === 'bot' ? rest : { ...rest, photoUrl };
      // allows_write_to_pm подписан Telegram: разрешение писать берём из него (снять его может только ошибка отправки).
      const allowed = user.allows_write_to_pm === true ? { writeAccess: true } : {};
      const row = await prisma.user.upsert({
        where: { id: BigInt(user.id) },
        create: { id: BigInt(user.id), ...profile, ...allowed },
        update: { ...profile, ...allowed, lastSeenAt: new Date() },
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
        theme: row.theme,
        haptics: row.haptics,
        rating: row.rating,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        docsVersion: row.docsVersion,
        banned: row.banned,
        notifications: row.notifications,
        writeAccess: row.writeAccess,
        onboarded: row.onboarded,
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
            glow: isGlow(row.glow) ? row.glow : 'none',
            lang: resolveLang(row.language, row.tgLanguage),
            docsVersion: row.docsVersion,
            banned: row.banned,
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
    async alertTarget(id) {
      const row = await prisma.user.findUnique({
        where: { id: BigInt(id) },
        select: { language: true, tgLanguage: true, notifications: true, writeAccess: true },
      });
      return row ? { id, lang: resolveLang(row.language, row.tgLanguage), notifications: row.notifications, writeAccess: row.writeAccess } : null;
    },
    async setWriteAccess(id, allowed) {
      await prisma.user.updateMany({ where: { id: BigInt(id) }, data: { writeAccess: allowed } });
    },
    async updateSettings(id, patch) {
      const done = await prisma.user.updateMany({ where: { id: BigInt(id) }, data: patch });
      if (done.count === 0) return null;
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: BigInt(id) },
        select: { notifications: true, writeAccess: true, language: true, tgLanguage: true, reducedMotion: true, theme: true, haptics: true, onboarded: true },
      });
      return settingsOf(row);
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

export function toMeResponse(user: UserRecord, docsVersion: string, serverNow = Date.now(), admin = false): MeResponse {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    language: user.language,
    lang: resolveLang(user.language, user.tgLanguage),
    autoLang: langFromTelegram(user.tgLanguage),
    reducedMotion: user.reducedMotion,
    theme: user.theme,
    haptics: user.haptics,
    rating: user.rating,
    games: user.games,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    docsAccepted: user.docsVersion === docsVersion,
    admin,
    banned: Boolean(user.banned),
    onboarded: user.onboarded,
    notifications: user.notifications,
    writeAccess: user.writeAccess,
    serverNow,
  };
}
