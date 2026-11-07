/**
 * Этап 8: реакции сопернику с двумя настоящими клиентами.
 * В снимок партии не попадают, состояние не меняют; кулдаун 2 с считает сервер.
 */
import { describe, expect, it } from 'vitest';
import { REACTION_COOLDOWN_MS, TIMINGS } from '@quiz-duel/shared';
import { anya, ilya, lobby, mark, player, playOut, start, stateWhere, until, world } from './socketWorld.js';

describe('Этап 8: реакции', () => {
  it('лобби: реакция приходит обоим, повтор раньше 2 с - rate_limited, после - снова можно', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    const revBefore = a.states.at(-1)!.rev;

    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '🔥' })).toEqual({ ok: true });
    const got = await until(() => b.reactions[0], 'реакция у Марка');
    expect(got).toEqual({ gameId, userId: ilya.id, emoji: '🔥' });
    await until(() => a.reactions[0], 'своя реакция у Ильи');

    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '👍' })).toMatchObject({ ok: false, error: 'rate_limited' });
    await w.clock.advance(REACTION_COOLDOWN_MS);
    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '👍' })).toEqual({ ok: true });
    // У соперника свой кулдаун.
    expect(await b.socket.emitWithAck('game:react', { gameId, emoji: '😂' })).toEqual({ ok: true });
    await until(() => a.reactions.length === 3 && b.reactions.length === 3, 'три реакции у обоих');

    // Состояние партии не изменилось: новых снимков нет, rev прежний.
    expect(a.states.at(-1)!.rev).toBe(revBefore);
  });

  it('во время вопроса, на раскрытии и на итогах - можно', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    await start(w, a, b, gameId);

    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '🔥' })).toEqual({ ok: true });
    await until(() => b.reactions.some((r) => r.emoji === '🔥'), 'реакция во время вопроса');
    await w.clock.advance(2_100);
    await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 });
    await b.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 1 });
    await stateWhere(a, 'раскрытие', (v) => v.phase === 'reveal');
    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '😮' })).toEqual({ ok: true });
    await until(() => b.reactions.some((r) => r.emoji === '😮'), 'реакция на раскрытии');

    // Реакция не задерживает партию: следующий вопрос по таймеру, как обычно.
    await w.clock.advance(TIMINGS.revealMs);
    await stateWhere(a, 'вопрос 2', (v) => v.phase === 'question' && v.question?.index === 1);

    // Доигрываем со 2-го вопроса.
    for (let i = 1; i < 10; i++) {
      await stateWhere(a, `вопрос ${i + 1}`, (v) => v.phase === 'question' && v.question?.index === i);
      await a.socket.emitWithAck('game:answer', { gameId, questionIndex: i, optionIndex: 0 });
      await b.socket.emitWithAck('game:answer', { gameId, questionIndex: i, optionIndex: 1 });
      await stateWhere(a, `раскрытие ${i + 1}`, (v) => v.phase === 'reveal' && v.reveal?.index === i);
      await w.clock.advance(TIMINGS.revealMs);
    }
    await stateWhere(b, 'итоги', (v) => v.phase === 'finished');
    expect(await b.socket.emitWithAck('game:react', { gameId, emoji: '👏' })).toEqual({ ok: true });
    await until(() => a.reactions.some((r) => r.emoji === '👏' && r.userId === mark.id), 'реакция на итогах');
  });

  it('посторонний, чужой эмодзи, пустое лобби и неизвестная игра отклоняются', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const c = await player(w, anya);
    const created = await a.socket.emitWithAck('game:create', { category: 'mix' });
    if (!created.ok) throw new Error(created.error);
    const gameId = created.game.id;

    // Соперника ещё нет - реагировать некому.
    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '👍' })).toMatchObject({ ok: false, error: 'wrong_phase' });
    await b.socket.emitWithAck('game:join', { gameId });

    expect(await c.socket.emitWithAck('game:react', { gameId, emoji: '👍' })).toMatchObject({ ok: false, error: 'not_participant' });
    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '💩' as never })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '👍', text: 'hi' } as never)).toMatchObject({ ok: false, error: 'invalid' });
    expect(await a.socket.emitWithAck('game:react', { gameId: 'Nope000000', emoji: '👍' })).toMatchObject({ ok: false, error: 'not_found' });
    // Отказы не тратят кулдаун: первая настоящая реакция проходит.
    expect(await a.socket.emitWithAck('game:react', { gameId, emoji: '👍' })).toEqual({ ok: true });
    expect(c.reactions).toEqual([]);
  });

  it('полная партия с реакциями идёт как обычно: 10 вопросов, итоги и рейтинг у обоих', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b, 'history');
    await a.socket.emitWithAck('game:react', { gameId, emoji: '😤' });
    await start(w, a, b, gameId);
    await playOut(w, a, b, gameId);
    const fin = a.states.at(-1)!;
    expect(fin).toMatchObject({ phase: 'finished', result: { reason: 'completed' } });
    expect(fin.result!.rating).not.toBeNull();
  });
});
