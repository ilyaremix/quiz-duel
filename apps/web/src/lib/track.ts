/**
 * Обновление 2.0: аналитика для админки - экраны и кнопки. Копим пачкой и шлём раз в 10 с
 * (и когда приложение сворачивают). Ошибка отправки игре не мешает: события просто теряются.
 */
import { useEffect } from 'react';
import { AUTH_SCHEME, type EventName } from '@quiz-duel/shared';

let auth = '';
let queue: EventName[] = [];
let timer: number | null = null;
let last: { name: EventName; at: number } | null = null;

export function setTrackAuth(initDataRaw: string) {
  auth = initDataRaw;
}

function flush(keepalive = false) {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!auth || queue.length === 0) return;
  const events = queue.slice(0, 50);
  queue = queue.slice(50);
  void fetch('/api/events', {
    method: 'POST',
    headers: { Authorization: `${AUTH_SCHEME} ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
    keepalive,
  }).catch(() => undefined);
  if (queue.length) flush(keepalive);
}

/** Экран или нажатие. Один и тот же экран дважды подряд за секунду не считается. */
export function track(name: EventName) {
  const now = Date.now();
  if (last && last.name === name && now - last.at < 1000) return;
  last = { name, at: now };
  queue.push(name);
  if (queue.length >= 40) return flush();
  timer ??= window.setTimeout(() => flush(), 10_000);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}

/** Экран открыт: считается при появлении и при смене key (например, новая партия). */
export function useTrack(name: EventName | null, key?: string) {
  useEffect(() => {
    if (name) track(name);
  }, [name, key]);
}
