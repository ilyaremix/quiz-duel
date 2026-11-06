import { init, isTMA, miniApp, retrieveRawInitData, themeParams, viewport } from '@tma.js/sdk-react';

export interface TelegramSession {
  /** Подписанная строка initData - её проверяет сервер. */
  initDataRaw: string;
  languageCode: string | undefined;
  startParam: string | undefined;
}

function applyColorScheme(isDark: boolean) {
  const root = document.documentElement;
  root.classList.toggle('qd-dark', isDark);
  root.classList.toggle('qd-light', !isDark);
}

/** Поля initData нужны клиенту только для подсказок (язык до ответа сервера); доверяет он серверу. */
function readUnverified(initDataRaw: string) {
  const params = new URLSearchParams(initDataRaw);
  let languageCode: string | undefined;
  try {
    languageCode = (JSON.parse(params.get('user') ?? '{}') as { language_code?: string }).language_code;
  } catch {
    languageCode = undefined;
  }
  return { languageCode, startParam: params.get('start_param') ?? undefined };
}

/** Тема, раскрытие на весь экран, safe area, сигнал «готово». */
function setupSdk() {
  init();

  // --tg-theme-* на <html>; класс тёмной/светлой схемы следит за сменой темы.
  themeParams.mount.ifAvailable();
  themeParams.bindCssVars.ifAvailable();
  document.documentElement.classList.add('qd-tg-theme');
  applyColorScheme(themeParams.isDark());
  themeParams.isDark.sub(() => applyColorScheme(themeParams.isDark()));

  miniApp.mount.ifAvailable();
  miniApp.setHeaderColor.ifAvailable('secondary_bg_color');
  miniApp.setBgColor.ifAvailable('secondary_bg_color');

  // Высота и отступы под вырез в --tg-viewport-*.
  const mounting = viewport.mount.ifAvailable();
  if (mounting.ok) {
    void Promise.resolve(mounting.data)
      .then(() => {
        viewport.bindCssVars.ifAvailable();
        viewport.expand.ifAvailable();
      })
      .catch(() => undefined);
  }

  miniApp.ready.ifAvailable();
}

/** Вне Telegram возвращает null - тогда показываем заглушку «Откройте в Telegram». */
export function setupTelegram(): TelegramSession | null {
  let initDataRaw: string | undefined;
  try {
    initDataRaw = isTMA() ? retrieveRawInitData() : undefined;
  } catch {
    initDataRaw = undefined;
  }
  if (!initDataRaw) {
    applyColorScheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
    return null;
  }

  try {
    setupSdk();
  } catch (error) {
    // Без SDK теряем только тему и жесты; играть по initData всё равно можно.
    console.warn('Telegram SDK init failed', error);
    applyColorScheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  return { initDataRaw, ...readUnverified(initDataRaw) };
}

export function closeMiniApp() {
  if (miniApp.close.ifAvailable().ok) return;
  window.close();
}
