import { randomInt } from 'node:crypto';

/** Источник случайности [0, 1). В тестах подменяется на детерминированный. */
export type Rng = () => number;

/** По умолчанию - криптостойкий: порядок вопросов и вариантов нельзя предсказать. */
export const secureRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** Детерминированный генератор (mulberry32) для тестов. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Перемешивание Фишера - Йетса, исходный массив не меняется. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
