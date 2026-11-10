/**
 * Сбой базы в фоновой работе не роняет сервер.
 *
 * Обращение из прода: «Ночью сервер сам перезапустился» - в журнале перед падением ошибка соединения
 * с базой и Unhandled rejection. Node завершает процесс, если отказ промиса никто не поймал, поэтому
 * каждое фоновое дело (таймер, уведомление «вдогонку») обязано ловить свои ошибки само.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUEUE } from '@quiz-duel/shared';
import { background, guardProcess } from '../src/background.js';
import { ilya, mark, player, until, world, type Player } from './socketWorld.js';

const matchedOf = (p: Player) => p.events.find((e) => e.name === 'queue:matched')?.data as { gameId: string } | undefined;

/** Отказы промисов, которые никто не поймал, - то, от чего Node завершает процесс. */
function watchUnhandled() {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => seen.push(reason);
  process.on('unhandledRejection', listener);
  return { seen, stop: () => process.off('unhandledRejection', listener) };
}

let watch: ReturnType<typeof watchUnhandled> | null = null;
afterEach(() => {
  watch?.stop();
  watch = null;
});

/** Отказ без обработчика Node замечает не сразу, а после очереди микрозадач. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('сбой базы в фоне не роняет сервер', () => {
  it('база недоступна, пока таймер подбирает пару в очереди: процесс жив, игроки остаются в очереди и находят друг друга, когда база вернулась', async () => {
    const w = await world();
    // Разница 250: пара сложится не при входе в очередь, а позже - по таймеру, без запроса игрока.
    w.users.rows.get(mark.id)!.rating = 1250;
    const a = await player(w, ilya);
    const b = await player(w, mark);
    await a.socket.emitWithAck('queue:join', {});
    await b.socket.emitWithAck('queue:join', {});

    watch = watchUnhandled();
    const load = w.repo.load;
    w.repo.load = async () => {
      throw new Error("Can't reach database server at `db:5432`");
    };
    await w.clock.advance(15_000 + QUEUE.tickMs);
    await settle();
    expect(watch.seen).toEqual([]);
    expect(matchedOf(a)).toBeUndefined();
    expect([w.games.isQueued(ilya.id), w.games.isQueued(mark.id)]).toEqual([true, true]);

    w.repo.load = load;
    await w.clock.advance(QUEUE.tickMs);
    await until(() => matchedOf(a) && matchedOf(b), 'пара после возвращения базы');
    expect(watch.seen).toEqual([]);
  });

  it('background: сбой фонового дела - запись в журнал, а не непойманный отказ', async () => {
    watch = watchUnhandled();
    const log = { error: vi.fn() };
    background(log, 'friend push', async () => {
      throw new Error('db down');
    });
    background(log, 'sync throw', () => {
      throw new Error('boom');
    });
    background(log, 'fine', async () => 1);
    await settle();
    expect(watch.seen).toEqual([]);
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ what: 'friend push', err: expect.any(Error) }), 'background job failed');
  });

  it('страховка процесса: пропущенный отказ пишется в журнал и не завершает процесс, необработанное исключение - штатная остановка', () => {
    const proc = new EventEmitter();
    const log = { error: vi.fn(), fatal: vi.fn() };
    const alert = vi.fn();
    const fatal = vi.fn();
    guardProcess(proc, log, { alert, fatal });
    proc.emit('unhandledRejection', new Error('missed catch'), Promise.resolve());
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'unhandled rejection');
    expect(alert).toHaveBeenCalledWith('unhandledRejection', expect.stringContaining('missed catch'));
    expect(fatal).not.toHaveBeenCalled();
    proc.emit('uncaughtException', new Error('broken invariant'));
    expect(log.fatal).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'uncaught exception');
    expect(fatal).toHaveBeenCalledTimes(1);
  });
});
