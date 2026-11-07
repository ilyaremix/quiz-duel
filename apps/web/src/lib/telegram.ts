import {
  backButton,
  closingBehavior,
  hapticFeedback,
  init,
  isTMA,
  miniApp,
  requestWriteAccess,
  retrieveRawInitData,
  swipeBehavior,
  themeParams,
  viewport,
} from '@tma.js/sdk-react';

export interface TelegramSession {
  /** Подписанная строка initData - её проверяет сервер. */
  initDataRaw: string;
  languageCode: string | undefined;
  startParam: string | undefined;
}

/** Фон приложения в стиле C (--qd-bg в styles.css) - им же красим шапку и низ Telegram. */
const CHROME_BG = { dark: '#070818', light: '#EEF0FA' } as const;

function applyColorScheme(isDark: boolean) {
  const root = document.documentElement;
  root.classList.toggle('qd-dark', isDark);
  root.classList.toggle('qd-light', !isDark);
}

/** Шапка, фон под приложением и нижняя панель Telegram - в цвет нашего фона, а не темы Telegram. */
function applyChromeColors(isDark: boolean) {
  const bg = isDark ? CHROME_BG.dark : CHROME_BG.light;
  safe(() => {
    // Старые клиенты не умеют произвольный цвет шапки - тогда ключ темы.
    const rgb = miniApp.setHeaderColor.supports('rgb');
    miniApp.setHeaderColor.ifAvailable(rgb ? bg : 'bg_color');
  });
  safe(() => miniApp.setBgColor.ifAvailable(bg));
  safe(() => miniApp.setBottomBarColor.ifAvailable(bg));
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

  // Из темы Telegram берём только схему - тёмная или светлая. Цвета свои (стиль C, styles.css),
  // поэтому --tg-theme-* от Telegram на <html> не подключаем.
  themeParams.mount.ifAvailable();
  applyColorScheme(themeParams.isDark());

  miniApp.mount.ifAvailable();
  applyChromeColors(themeParams.isDark());
  themeParams.isDark.sub(() => {
    applyColorScheme(themeParams.isDark());
    applyChromeColors(themeParams.isDark());
  });

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

  // Кнопка «Назад», жесты и подтверждение закрытия - для партии (setGameGuards, onBack).
  backButton.mount.ifAvailable();
  swipeBehavior.mount.ifAvailable();
  closingBehavior.mount.ifAvailable();

  miniApp.ready.ifAvailable();
}

/** Вызов SDK, который вне Telegram (или в старом клиенте) просто ничего не делает. */
function safe(fn: () => unknown) {
  try {
    fn();
  } catch {
    // Нет метода в этой версии Telegram - не критично для игры.
  }
}

/**
 * Во время партии свайп вниз не закрывает приложение, а закрытие крестиком
 * спрашивает подтверждение. Вне партии - как обычно.
 */
export function setGameGuards(on: boolean) {
  safe(() => (on ? swipeBehavior.disableVertical.ifAvailable() : swipeBehavior.enableVertical.ifAvailable()));
  safe(() => (on ? closingBehavior.enableConfirmation.ifAvailable() : closingBehavior.disableConfirmation.ifAvailable()));
}

/**
 * Системная кнопка «Назад» Telegram. Показывается, пока жив обработчик; возвращает отписку.
 * На компьютере то же действие висит на Escape - удобно и в Telegram Desktop, и при отладке в браузере.
 */
export function onBack(handler: () => void): () => void {
  let off: (() => void) | undefined;
  safe(() => {
    backButton.show.ifAvailable();
    const res = backButton.onClick.ifAvailable(handler);
    if (res.ok) off = res.data;
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') handler();
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    safe(() => off?.());
    safe(() => backButton.hide.ifAvailable());
  };
}

/**
 * Приложение снова на экране: развернули из фона, вернулись в Telegram из другого
 * приложения или из свёрнутого состояния. Telegram сообщает об этом своим событием
 * (miniApp.isActive), браузер - visibilitychange; срабатывает не чаще раза в секунду.
 */
export function onResume(handler: () => void): () => void {
  let lastAt = 0;
  const fire = () => {
    const now = Date.now();
    if (now - lastAt < 1_000) return;
    lastAt = now;
    handler();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') fire();
  };
  document.addEventListener('visibilitychange', onVisibility);
  let off: (() => void) | undefined;
  safe(() => {
    off = miniApp.isActive.sub((active: boolean) => {
      if (active) fire();
    });
  });
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    safe(() => off?.());
  };
}

/** Вибрация включена в настройках игрока (по умолчанию да; приходит в /api/me). */
let hapticsOn = true;
export function setHapticsEnabled(on: boolean) {
  hapticsOn = on;
}

/** Вызов вибрации: ничего не делает, если игрок её выключил или Telegram её не умеет. */
function buzz(fn: () => unknown) {
  if (hapticsOn) safe(fn);
}

/** Вибрация: лёгкая на выбор ответа, success / error на раскрытии, сильная на победу, тики на последних секундах. */
export const haptic = {
  select: () => buzz(() => hapticFeedback.impactOccurred.ifAvailable('light')),
  tick: () => buzz(() => hapticFeedback.selectionChanged.ifAvailable()),
  success: () => buzz(() => hapticFeedback.notificationOccurred.ifAvailable('success')),
  error: () => buzz(() => hapticFeedback.notificationOccurred.ifAvailable('error')),
  win: () =>
    buzz(() => {
      hapticFeedback.notificationOccurred.ifAvailable('success');
      hapticFeedback.impactOccurred.ifAvailable('heavy');
    }),
};

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

/**
 * Просит у игрока разрешение, чтобы бот мог ему писать (уведомления о лобби, реванше, итогах).
 * true - разрешил. Вне Telegram или в старом клиенте - false.
 */
export async function askWriteAccess(): Promise<boolean> {
  try {
    if (!requestWriteAccess.isAvailable()) return false;
    return (await requestWriteAccess()) === 'allowed';
  } catch {
    return false;
  }
}
