import i18n from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';
import type { Lang } from '@quiz-duel/shared';
// Словари - отдельными файлами: скачивается только язык игрока, второй - если он сменит язык.
import ruUrl from './locales/ru.json?url';
import enUrl from './locales/en.json?url';
// Экраны загрузки и ошибок (s01, s24) говорят на языке игрока ещё до словаря: эти строки - в стартовом файле.
import { app as ruApp, s01 as ruS01, s24 as ruS24 } from './locales/ru.json';
import { app as enApp, s01 as enS01, s24 as enS24 } from './locales/en.json';

const URLS: Record<Lang, string> = { ru: ruUrl, en: enUrl };
const BOOT = {
  ru: { app: ruApp, s01: ruS01, s24: ruS24 },
  en: { app: enApp, s01: enS01, s24: enS24 },
} as const;

export function initI18n(lang: Lang) {
  void i18n.use(initReactI18next).init({
    resources: { ru: { translation: BOOT.ru }, en: { translation: BOOT.en } },
    lng: lang,
    // Ключи RU и EN совпадают (test/locales.test.ts) - запасной язык не нужен и не скачивается.
    fallbackLng: false,
    supportedLngs: ['ru', 'en'],
    // React сам экранирует текст.
    interpolation: { escapeValue: false },
    returnNull: false,
    // Пришёл полный словарь - экраны с useTranslation перерисовываются сами.
    react: { bindI18nStore: 'added' },
  });
  document.documentElement.lang = lang;
  void loadLang(lang).catch(() => undefined);
  return i18n;
}

// ---------------------------------------------------------------------------
// Полные словари

let loaded: ReadonlySet<Lang> = new Set();
let failed: ReadonlySet<Lang> = new Set();
const pending = new Map<Lang, Promise<void>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Скачать словарь языка (один раз; уже идущая загрузка не повторяется). */
export function loadLang(lang: Lang): Promise<void> {
  let p = pending.get(lang);
  if (!p) {
    p = fetchDict(URLS[lang]).then(
      (dict) => {
        i18n.addResourceBundle(lang, 'translation', dict, true, true);
        loaded = new Set([...loaded, lang]);
        notify();
      },
      (error: unknown) => {
        pending.delete(lang);
        failed = new Set([...failed, lang]);
        notify();
        throw error;
      },
    );
    pending.set(lang, p);
  }
  return p;
}

/** Обрыв сети - ещё три попытки: через 1, 2 и 4 с. */
async function fetchDict(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as Record<string, unknown>;
      if (attempt >= 3) throw new Error(`dictionary: HTTP ${res.status}`);
    } catch (error) {
      if (attempt >= 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  i18n.on('languageChanged', listener);
  return () => {
    listeners.delete(listener);
    i18n.off('languageChanged', listener);
  };
}

/** Словарь текущего языка: скачан, ещё качается или не скачался совсем. */
export function useDictionary(): 'ready' | 'loading' | 'failed' {
  return useSyncExternalStore(subscribe, () => {
    const lang = i18n.language as Lang;
    return loaded.has(lang) ? 'ready' : failed.has(lang) ? 'failed' : 'loading';
  });
}

const LANG_KEY = 'qd.lang';

/** Язык из профиля: сначала скачивается словарь, потом переключается текст - без ключей вместо слов. */
export async function setLang(lang: Lang) {
  try {
    await loadLang(lang);
  } catch {
    return;
  }
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
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
