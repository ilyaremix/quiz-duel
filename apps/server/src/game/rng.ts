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

/**
 * Темы драфта «Микса»: каждому игроку по `per` тем, пересечение - минимально возможное.
 * Хватает тем - наборы совсем разные; нет (5 тем, 3 + 3) - общих ровно столько, сколько не хватает
 * (одна), остальные у каждого свои. Порядок внутри набора случайный, общая тема не стоит на одном месте.
 */
export function draftOffers<T>(items: readonly T[], players: number, per: number, rng: Rng): T[][] {
  const pool = shuffle(items, rng);
  const n = Math.min(per, pool.length);
  if (players <= 1) return [pool.slice(0, n)];
  const shared = Math.max(0, Math.ceil((players * n - pool.length) / (players - 1)));
  const common = pool.slice(0, Math.min(shared, n));
  let next = common.length;
  return Array.from({ length: players }, () => {
    const own = pool.slice(next, next + n - common.length);
    next += own.length;
    const set = [...common, ...own];
    // Если тем совсем мало, добираем из общего пула без повторов внутри набора.
    for (const c of pool) if (set.length < n && !set.includes(c)) set.push(c);
    return shuffle(set, rng);
  });
}
