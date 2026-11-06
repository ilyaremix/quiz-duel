/** Язык интерфейса и вопросов. */
export type Lang = 'ru' | 'en';

/** Настройка языка в профиле: «Авто» или явный выбор. */
export type LangSetting = 'auto' | Lang;

export const LANGS: readonly Lang[] = ['ru', 'en'];

/** Коды Telegram, для которых по умолчанию показываем русский. */
export const RU_LANGUAGE_CODES: readonly string[] = ['ru', 'uk', 'be', 'kk'];

/**
 * language_code из Telegram (IETF-тег: "ru", "en", "pt-br") → язык приложения.
 * ru, uk, be, kk дают русский, всё остальное и пустое значение - английский.
 */
export function langFromTelegram(code: string | null | undefined): Lang {
  if (!code) return 'en';
  const primary = code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return RU_LANGUAGE_CODES.includes(primary) ? 'ru' : 'en';
}

/** Порядок выбора: настройка профиля → language_code Telegram → английский. */
export function resolveLang(setting: LangSetting | null | undefined, telegramCode: string | null | undefined): Lang {
  if (setting === 'ru' || setting === 'en') return setting;
  return langFromTelegram(telegramCode);
}
