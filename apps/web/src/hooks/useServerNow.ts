import { useEffect, useState } from 'react';
import { serverNow } from '../lib/game';

/**
 * Текущее время сервера, обновляется раз в intervalMs. Перерисовывает тот компонент, где вызван, -
 * поэтому вызывать в маленьком компоненте (таймер, отсчёт), а не в целом экране.
 */
export function useServerNow(intervalMs = 250): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(serverNow()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const secondsLeft = (endsAt: number | null) => (endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)));

/**
 * Сколько целых секунд осталось до endsAt по часам сервера (с округлением вверх, как на табло).
 * Перерисовка - ровно на границе секунды, а не 10 раз в секунду.
 */
export function useServerSecondsLeft(endsAt: number | null): number {
  const [left, setLeft] = useState(() => secondsLeft(endsAt));
  useEffect(() => {
    if (endsAt === null) {
      setLeft(0);
      return;
    }
    let timer = 0;
    const tick = () => {
      const ms = endsAt - serverNow();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      // До следующей смены цифры (+5 мс, чтобы точно перешагнуть границу).
      if (ms > 0) timer = window.setTimeout(tick, (ms % 1000 || 1000) + 5);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [endsAt]);
  return left;
}

/** Наступило ли время at по часам сервера. Перерисовка - один раз, в этот момент. */
export function useServerPassed(at: number | null): boolean {
  const [passed, setPassed] = useState(() => at !== null && serverNow() >= at);
  useEffect(() => {
    if (at === null) return setPassed(false);
    const ms = at - serverNow();
    setPassed(ms <= 0);
    if (ms <= 0) return;
    const timer = window.setTimeout(() => setPassed(true), ms + 5);
    return () => window.clearTimeout(timer);
  }, [at]);
  return passed;
}

/** Секунды → «14:32». */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
