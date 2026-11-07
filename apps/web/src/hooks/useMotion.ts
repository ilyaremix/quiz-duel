import { useEffect, useRef, useState } from 'react';

/** Включён ли режим без анимаций (настройка игрока + система + слабое устройство) - см. lib/motion.ts. */
export { useReducedMotion } from '../lib/motion';

/**
 * Число, которое плавно «досчитывает» до нового значения (счёт на раскрытии - 300 мс,
 * рейтинг на итогах - 900 мс), с замедлением к концу. Без анимаций - сразу итог.
 */
export function useCountUp(value: number, durationMs: number, reduced: boolean, delayMs = 0): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (reduced || start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    let t0 = 0;
    const step = (t: number) => {
      t0 ||= t + delayMs;
      const p = Math.min(1, Math.max(0, (t - t0) / durationMs));
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(start + (value - start) * eased);
      from.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced, delayMs]);
  return shown;
}
