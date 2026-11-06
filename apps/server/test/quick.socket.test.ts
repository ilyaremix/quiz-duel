/**
 * Этап 8: быстрая игра - очередь с подбором по рейтингу (±100, шире на 50 каждые 5 с),
 * найденные попадают в обычное лобби «Микс» с «Готов». Дальше - обычная рейтинговая дуэль.
 */
import { describe, expect, it } from 'vitest';
import { QUEUE, queueRange } from '@quiz-duel/shared';
import { anya, ilya, lobby, mark, player, playOut, start, stateWhere, until, world, type Player, type World } from './socketWorld.js';

const setRating = (w: World, id: number, rating: number) => {
  w.users.rows.get(id)!.rating = rating;
};
const matchedOf = (p: Player) => p.events.find((e) => e.name === 'queue:matched')?.data as { gameId: string } | undefined;
const timedOut = (p: Player) => p.events.some((e) => e.name === 'queue:timeout');

describe('Этап 8: быстрая игра', () => {
  it('окно рейтинга: ±100, шире на 50 каждые 5 с', () => {
    expect([0, 4_999, 5_000, 12_000, 59_000].map(queueRange)).toEqual([100, 100, 150, 200, 650]);
  });

  it('близкие по рейтингу находят друг друга сразу: лобби «Микс» без «Готов», дальше обычная дуэль с рейтингом', async () => {
    const w = await world();
    setRating(w, mark.id, 1060);
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const ja = await a.socket.emitWithAck('queue:join', {});
    expect(ja).toMatchObject({ ok: true, rating: 1000, since: expect.any(Number) });
    expect(await b.socket.emitWithAck('queue:join', {})).toMatchObject({ ok: true, rating: 1060 });

    const m = await until(() => matchedOf(a) && matchedOf(b), 'оба нашли соперника');
    expect(matchedOf(a)!.gameId).toBe(m.gameId);
    const la = await stateWhere(a, 'лобби у Ильи', (v) => v.id === m.gameId);
    expect(la).toMatchObject({ mode: 'quick', category: 'mix', phase: 'lobby', me: { ready: false }, opponent: { userId: mark.id, ready: false } });
    expect(a.hello.currentGameId).toBeNull();
    expect(w.games.currentGameOf(ilya.id)).toBe(m.gameId);

    await start(w, a, b, m.gameId);
    await playOut(w, a, b, m.gameId);
    const fin = a.states.at(-1)!;
    expect(fin.result!.rating).not.toBeNull();
    expect(w.repo.players.get(ilya.id)!.games).toBe(1);
  }, 20_000);

  it('далёкие по рейтингу ждут, пока окно не расширится: разница 250 - пара через 15 с', async () => {
    const w = await world();
    setRating(w, mark.id, 1250);
    const a = await player(w, ilya);
    const b = await player(w, mark);
    await a.socket.emitWithAck('queue:join', {});
    await b.socket.emitWithAck('queue:join', {});
    await w.clock.advance(10_000);
    expect(matchedOf(a)).toBeUndefined();
    await w.clock.advance(5_000 + QUEUE.tickMs);
    await until(() => matchedOf(a) && matchedOf(b), 'пара через 15 с');
  });

  it('за 60 с никого - queue:timeout, игрок больше не в очереди; повторный join - та же очередь', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const first = await a.socket.emitWithAck('queue:join', {});
    await w.clock.advance(20_000);
    const again = await a.socket.emitWithAck('queue:join', {});
    expect(again.ok && first.ok && again.since).toBe(first.ok && first.since);
    await w.clock.advance(QUEUE.timeoutMs);
    await until(() => timedOut(a), 'timeout');
    expect(w.games.isQueued(ilya.id)).toBe(false);
  });

  it('«Отмена», закрытое приложение или своя дуэль убирают из очереди - пары не будет', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const c = await player(w, anya);
    await a.socket.emitWithAck('queue:join', {});
    expect(await a.socket.emitWithAck('queue:leave', {})).toEqual({ ok: true });
    await b.socket.emitWithAck('queue:join', {});
    b.socket.disconnect();
    await until(() => !w.games.isQueued(mark.id), 'Марк вышел из очереди');
    await c.socket.emitWithAck('queue:join', {});
    await c.socket.emitWithAck('game:create', { category: 'sport' });
    expect(w.games.isQueued(anya.id)).toBe(false);

    const a2 = await player(w, ilya);
    await a2.socket.emitWithAck('queue:join', {});
    await w.clock.advance(QUEUE.tickMs * 3);
    expect(matchedOf(a2)).toBeUndefined();
  });

  it('из лобби или посреди дуэли - busy; без документов - consent_required', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    expect(await a.socket.emitWithAck('queue:join', {})).toMatchObject({ ok: false, error: 'busy', busyGameId: gameId });
    w.users.rows.get(anya.id)!.docsVersion = null;
    const c = await player(w, anya);
    expect(await c.socket.emitWithAck('queue:join', {})).toMatchObject({ ok: false, error: 'consent_required' });
    expect(await c.socket.emitWithAck('queue:join', { x: 1 } as never)).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('трое: новый игрок достаётся тому, кто ждёт дольше и подходит по рейтингу; третий ждёт дальше', async () => {
    const w = await world();
    setRating(w, mark.id, 1150);
    setRating(w, anya.id, 1080);
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const c = await player(w, anya);
    await a.socket.emitWithAck('queue:join', {});
    await b.socket.emitWithAck('queue:join', {});
    // Разница 150 при окне ±100 - Илья и Марк пока не пара.
    await w.clock.advance(3_000);
    expect(matchedOf(a)).toBeUndefined();
    await c.socket.emitWithAck('queue:join', {});
    await until(() => matchedOf(a), 'Илья нашёл соперника');
    const game = await stateWhere(a, 'лобби', (v) => v.id === matchedOf(a)!.gameId);
    expect(game.opponent!.userId).toBe(anya.id);
    expect(w.games.isQueued(mark.id)).toBe(true);
    expect(matchedOf(b)).toBeUndefined();
  });
});
