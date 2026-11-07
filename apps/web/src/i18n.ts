import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Lang } from '@quiz-duel/shared';
import ru from './locales/ru.json';
import en from './locales/en.json';

export const resources = {
  ru: { translation: ru },
  en: { translation: en },
} as const;

export function initI18n(lang: Lang) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'en',
    supportedLngs: ['ru', 'en'],
    // React сам экранирует текст.
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  document.documentElement.lang = lang;
  return i18n;
}

const LANG_KEY = 'qd.lang';

export function setLang(lang: Lang) {
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Хранилище недоступно (приватный режим WebView) - не страшно, язык всё равно придёт с сервера.
  }
}

/**
 * Язык с прошлого входа: чтобы экран загрузки не мигал другим языком, пока не ответил /api/me.
 * Решает всё равно сервер (настройка профиля → language_code → английский).
 */
export function cachedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'ru' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Числа по правилам языка: «2 340» и «2,340». */
export function formatNumber(value: number, lang: string) {
  return new Intl.NumberFormat(lang).format(value);
}
