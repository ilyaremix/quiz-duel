/**
 * Билет на платную тему - ровно на одну партию.
 *
 * Обращение из прода: «Купил один билет на тему «Космос», а играю в ней весь вечер».
 * Настоящие сокет-клиенты и менеджер партий; билеты - в памяти, с теми же правилами, что в базе
 * (economy.useTopic): один неиспользованный билет гасится один раз, повтор с тем же gameId - не второй раз.
 */
import { describe, expect, it } from 'vitest';
import type { ManagerDeps } from '../src/game/manager.js';
import { ilya, lobby, mark, player, playOut, start, stateWhere, world } from './socketWorld.js';

function tickets(initial: Record<number, number>) {
  const left = new Map(Object.entries(initial).map(([id, n]) => [Number(id), n]));
  /** На какую партию чей билет ушёл. */
  const spentOn = new Map<string, number>();
  const deps: Partial<ManagerDeps> = {
    topicAccess: async (userId) => (left.get(userId) ?? 0) > 0,
    useTopic: async (userId, _topic, gameId) => {
      if (spentOn.get(gameId) === userId) return true;
      const n = left.get(userId) ?? 0;
      if (n <= 0) return false;
      left.set(userId, n - 1);
      spentOn.set(gameId, userId);
      return true;
    },
    releaseTopic: async (userId, gameId) => {
      if (spentOn.get(gameId) !== userId) return;
      spentOn.delete(gameId);
      left.set(userId, (left.get(userId) ?? 0) + 1);
    },
  };
  return { left, spentOn, deps };
}

describe('билет на платную тему - на одну партию', () => {
  it('реванш в платной теме - новая партия и новый билет: без билета реванша нет', async () => {
    const t = tickets({ [ilya.id]: 1 });
    const w = await world(t.deps);
    const a = await player(w, ilya);
    const b = await player(w, mark);

    const first = await lobby(a, b, 'space');
    await start(w, a, b, first);
    await playOut(w, a, b, first);
    expect(t.left.get(ilya.id)).toBe(0);
    expect([...t.spentOn.keys()]).toEqual([first]);

    // Билет потрачен. Раньше «Реванш» начинал следующую партию в той же теме бесплатно - и так сколько угодно раз.
    expect(await a.socket.emitWithAck('rematch:offer', { gameId: first })).toMatchObject({ ok: false, error: 'locked' });
    expect(await b.socket.emitWithAck('rematch:offer', { gameId: first })).toMatchObject({ ok: false, error: 'locked' });
    expect(w.repo.rows.size).toBe(1);

    // Появился второй билет - реванш начинается и тратит его.
    t.left.set(ilya.id, 1);
    expect(await b.socket.emitWithAck('rematch:offer', { gameId: first })).toMatchObject({ ok: true });
    const accepted = await a.socket.emitWithAck('rematch:respond', { gameId: first, accept: true });
    expect(accepted).toMatchObject({ ok: true });
    const next = await stateWhere(a, 'реванш у A', (v) => v.rematchOf === first);
    expect(next).toMatchObject({ category: 'space', phase: 'countdown' });
    expect(t.left.get(ilya.id)).toBe(0);
    expect(t.spentOn.get(next.id)).toBe(ilya.id);
    expect(w.repo.rows.size).toBe(2);
  }, 20_000);

  it('билет пропал между предложением и согласием - реванш не начинается, предложение закрывается', async () => {
    const t = tickets({ [ilya.id]: 2 });
    const w = await world(t.deps);
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const first = await lobby(a, b, 'space');
    await start(w, a, b, first);
    await playOut(w, a, b, first);
    expect(await b.socket.emitWithAck('rematch:offer', { gameId: first })).toMatchObject({ ok: true });
    t.left.set(ilya.id, 0);
    expect(await a.socket.emitWithAck('rematch:respond', { gameId: first, accept: true })).toMatchObject({ ok: false, error: 'locked' });
    expect(w.repo.rows.size).toBe(1);
    const view = await stateWhere(b, 'предложение закрыто у B', (v) => v.id === first && v.rematch?.status !== 'offered');
    expect(view.rematch?.nextGameId ?? null).toBeNull();
  }, 20_000);

  it('тренировка: два запроса сразу - одна партия на один билет', async () => {
    const t = tickets({ [ilya.id]: 1 });
    const w = await world(t.deps);
    await player(w, ilya);
    const results = await Promise.all([w.games.soloStart(ilya.id, 'space'), w.games.soloStart(ilya.id, 'space')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(t.left.get(ilya.id)).toBe(0);
    expect(w.repo.rows.size).toBe(1);
  });

  it('билет списать не удалось (база не ответила) - партия в платной теме не начинается бесплатно', async () => {
    const t = tickets({ [ilya.id]: 1 });
    const w = await world({
      ...t.deps,
      useTopic: async () => {
        throw new Error("Can't reach database server");
      },
    });
    await player(w, ilya);
    expect(await w.games.soloStart(ilya.id, 'space')).toMatchObject({ ok: false });
    expect(w.repo.rows.size).toBe(0);
    expect(t.left.get(ilya.id)).toBe(1);
  });

  it('тренировку не удалось сохранить - списанный билет возвращается', async () => {
    const t = tickets({ [ilya.id]: 1 });
    const w = await world(t.deps);
    await player(w, ilya);
    const save = w.repo.save;
    w.repo.save = async () => {
      throw new Error("Can't reach database server");
    };
    expect(await w.games.soloStart(ilya.id, 'space')).toMatchObject({ ok: false, error: 'internal' });
    w.repo.save = save;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(t.left.get(ilya.id)).toBe(1);
    expect(await w.games.soloStart(ilya.id, 'space')).toMatchObject({ ok: true });
    expect(t.left.get(ilya.id)).toBe(0);
  });

  it('купленная тема и обычные темы: реванш как раньше, билеты не трогаются', async () => {
    const t = tickets({});
    const w = await world({ ...t.deps, topicAccess: async () => true, useTopic: async () => true });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const first = await lobby(a, b, 'space');
    await start(w, a, b, first);
    await playOut(w, a, b, first);
    expect(await a.socket.emitWithAck('rematch:offer', { gameId: first })).toMatchObject({ ok: true });
    expect(await b.socket.emitWithAck('rematch:respond', { gameId: first, accept: true })).toMatchObject({ ok: true });
  }, 20_000);
});
