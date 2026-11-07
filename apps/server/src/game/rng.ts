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
 * Темы драфта «Микса»: у каждого игрока свой пул (5 базовых тем + купленные навсегда платные),
 * каждому - по `per` тем, пересечение минимально возможное. Один расклад: игроки в случайном
 * порядке берут по одной теме из своего перемешанного пула, сначала - ещё никому не выпавшие.
 * Жадный расклад не всегда лучший (купивший мог занять базовые темы, нужные сопернику), поэтому
 * пробуем несколько и берём тот, где общих тем меньше. Из 5 общих тем по 3: общая ровно одна.
 */
export function draftOffers<T>(pools: readonly (readonly T[])[], per: number, rng: Rng, attempts = 24): T[][] {
  const deal = () => {
    const orders = pools.map((pool) => shuffle([...new Set(pool)], rng));
    const sets: T[][] = pools.map(() => []);
    const used = new Set<T>();
    for (let round = 0; round < per; round++) {
      for (const i of shuffle(
        orders.map((_, k) => k),
        rng,
      )) {
        const own = sets[i]!;
        const order = orders[i]!;
        const pick = order.find((c) => !used.has(c) && !own.includes(c)) ?? order.find((c) => !own.includes(c));
        if (pick === undefined) continue;
        own.push(pick);
        used.add(pick);
      }
    }
    return sets;
  };
  const overlap = (sets: T[][]) => sets.reduce((n, set) => n + set.length, 0) - new Set(sets.flat()).size;
  let best = deal();
  for (let k = 1; k < attempts && overlap(best) > 0; k++) {
    const next = deal();
    if (overlap(next) < overlap(best)) best = next;
  }
  return best.map((set) => shuffle(set, rng));
}
