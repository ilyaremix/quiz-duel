/**
 * Один игрок - одна партия, даже если запросы пришли одновременно (двойной тап, повтор после обрыва,
 * намеренная пачка запросов). Проверка «не занят ли игрок» и создание партии разделены ожиданием базы,
 * поэтому действия одного игрока, которые ведут в партию, идут строго по очереди.
 */
import { describe, expect, it } from 'vitest';
import { FINAL_PHASES } from '@quiz-duel/shared';
import { ilya, mark, player, world } from './socketWorld.js';

describe('одновременные запросы одного игрока', () => {
  it('три «Начать тренировку» сразу - одна тренировка, остальные получают busy', async () => {
    const w = await world();
    await player(w, ilya);
    const results = await Promise.all([w.games.soloStart(ilya.id, 'science'), w.games.soloStart(ilya.id, 'science'), w.games.soloStart(ilya.id, 'history')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? null : r.error))).toEqual(['busy', 'busy']);
    expect(w.repo.rows.size).toBe(1);
  });

  it('два «Создать игру» сразу - открытое лобби одно (первое закрывается, как при обычном пересоздании)', async () => {
    const w = await world();
    await player(w, ilya);
    const results = await Promise.all([w.games.create(ilya.id, 'science'), w.games.create(ilya.id, 'history')]);
    expect(results.every((r) => r.ok)).toBe(true);
    const open = [...w.repo.rows.values()].map((row) => row.state).filter((s) => !FINAL_PHASES.includes(s.phase));
    expect(open).toHaveLength(1);
    expect(w.games.currentGameOf(ilya.id)).toBe(open[0]!.id);
  });

  it('тренировка и очередь быстрой игры сразу - игрок оказывается только в одном месте', async () => {
    const w = await world();
    await player(w, ilya);
    await player(w, mark);
    const [solo, queue] = await Promise.all([w.games.soloStart(ilya.id, 'science'), w.games.queueJoin(ilya.id)]);
    expect([solo.ok, queue.ok].filter(Boolean)).toHaveLength(1);
    expect(w.games.isQueued(ilya.id)).toBe(queue.ok);
  });
});
