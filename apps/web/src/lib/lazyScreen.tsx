import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { FallbackScreen } from '../screens/FallbackScreen';

const preloads: (() => Promise<unknown>)[] = [];

/** Файл с экраном: скачивается один раз; не вышло (сеть мигнула) - следующая попытка скачает заново. */
function deferred<P extends object>(load: () => Promise<ComponentType<P>>) {
  const d = {
    ready: null as ComponentType<P> | null,
    pending: null as Promise<ComponentType<P>> | null,
    preload: (): Promise<ComponentType<P>> =>
      (d.pending ??= load().then(
        (screen) => (d.ready = screen),
        (error: unknown) => {
          d.pending = null;
          throw error;
        },
      )),
  };
  preloads.push(d.preload);
  return d;
}

/**
 * Экран отдельным файлом: он не входит в стартовую загрузку мини-аппа. Сразу после старта такие
 * экраны докачиваются в фоне (preloadScreens), и уже скачанный рисуется сразу, без заглушки.
 * Открыли раньше, чем он скачался, - пустой экран на мгновение.
 */
export function lazyScreen<P extends object>(load: () => Promise<ComponentType<P>>) {
  const d = deferred(load);
  const Lazy = lazy(async () => ({ default: await d.preload() }));

  return function LazyScreen(props: P) {
    // Как экран показан в первый раз, так и остаётся: смена обёртки пересоздала бы его состояние.
    const [Ready] = useState(() => d.ready);
    if (Ready) return <Ready {...props} />;
    return (
      <ScreenBoundary>
        <Suspense fallback={<main className="qd-screen" aria-busy="true" />}>
          <Lazy {...props} />
        </Suspense>
      </ScreenBoundary>
    );
  };
}

/**
 * Шторка или окно отдельным файлом (смонтированы всегда, закрытые ничего не рисуют): пока файл
 * не скачан - ничего; не скачался - новая попытка через 3 с.
 */
export function lazyOverlay<P extends object>(load: () => Promise<ComponentType<P>>) {
  const d = deferred(load);

  return function LazyOverlay(props: P) {
    const [Ready, setReady] = useState(() => d.ready);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (Ready) return;
      let alive = true;
      let retry: number | undefined;
      d.preload().then(
        (screen) => alive && setReady(() => screen),
        () => {
          if (alive) retry = window.setTimeout(() => setAttempt((n) => n + 1), 3_000);
        },
      );
      return () => {
        alive = false;
        window.clearTimeout(retry);
      };
    }, [Ready, attempt]);
    return Ready ? <Ready {...props} /> : null;
  };
}

/** Докачать все отложенные экраны в фоне. Не вышло - не страшно: экран скачается, когда его откроют. */
export function preloadScreens() {
  for (const preload of preloads) void preload().catch(() => undefined);
}

/**
 * Файл экрана не скачался: нет сети или после выкатки старого файла уже нет на сервере
 * (приложение было открыто до неё). Перезапуск загрузит новую версию.
 */
class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <FallbackScreen kind="error" onAction={() => window.location.reload()} /> : this.props.children;
  }
}
