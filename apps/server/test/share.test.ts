/**
 * Этап 8: «Поделиться результатом» - карточка в чат с итогом дуэли и кнопкой «Сыграть со мной».
 */
import { describe, expect, it } from 'vitest';
import type { ResultSharer } from '../src/game/manager.js';
import { resultCard } from '../src/bot/index.js';
import { anya, ilya, lobby, mark, player, playOut, start, world } from './socketWorld.js';

function fakeSharer() {
  const calls: Parameters<ResultSharer['prepare']>[0][] = [];
  const sharer: ResultSharer = {
    async prepare(input) {
      calls.push(input);
      return { id: `prep-${calls.length}`, expiresAt: Date.now() + 24 * 3_600_000 };
    },
  };
  return { calls, sharer };
}

describe('Этап 8: поделиться результатом', () => {
  it('итог глазами игрока, на его языке; повтор - то же сообщение; реванш после этого доступен', async () => {
    const f = fakeSharer();
    const w = await world({ sharer: f.sharer });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    // Во время партии делиться нечем.
    expect(await a.socket.emitWithAck('game:share', { gameId })).toMatchObject({ ok: false, error: 'wrong_phase' });
    await start(w, a, b, gameId);
    expect(await a.socket.emitWithAck('game:share', { gameId })).toMatchObject({ ok: false, error: 'wrong_phase' });
    await playOut(w, a, b, gameId);

    const fin = a.states.at(-1)!;
    const res = await a.socket.emitWithAck('game:share', { gameId });
    expect(res).toEqual({ ok: true, preparedMessageId: 'prep-1', link: 'https://t.me/quiz_test_bot/play' });
    expect(f.calls[0]).toMatchObject({ userId: ilya.id, lang: 'ru', outcome: fin.result!.outcome, me: fin.me.score, opp: fin.opponent!.score, opponent: 'Марк' });
    expect(await a.socket.emitWithAck('game:share', { gameId })).toMatchObject({ preparedMessageId: 'prep-1' });
    expect(f.calls).toHaveLength(1);

    const mine = await b.socket.emitWithAck('game:share', { gameId });
    expect(mine).toMatchObject({ ok: true, preparedMessageId: 'prep-2' });
    expect(f.calls[1]).toMatchObject({ lang: 'en', opponent: 'Илья' });

    // Поделиться - не уход с итогов: реванш предложить можно.
    expect((await a.socket.emitWithAck('rematch:offer', { gameId })).ok).toBe(true);
  }, 20_000);

  it('посторонний и неизвестная игра отклоняются; без бота - только ссылка', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const c = await player(w, anya);
    const gameId = await lobby(a, b);
    await start(w, a, b, gameId);
    await playOut(w, a, b, gameId);
    expect(await c.socket.emitWithAck('game:share', { gameId })).toMatchObject({ ok: false, error: 'not_participant' });
    expect(await a.socket.emitWithAck('game:share', { gameId: 'Nope000000' })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await a.socket.emitWithAck('game:share', { gameId })).toEqual({ ok: true, preparedMessageId: null, link: 'https://t.me/quiz_test_bot/play' });
  }, 20_000);

  it('карточка: исход, счёт, соперник (экранирован) и кнопка «Сыграть со мной»', () => {
    const web = 'https://quiz.example.sslip.io';
    const ru = resultCard({ gameId: 'Abcde12345', lang: 'ru', outcome: 'win', me: 8420, opp: 6100, opponent: '<Марк>', link: 'https://t.me/b/app', webAppUrl: web });
    expect(ru).toMatchObject({ type: 'mpeg4_gif', mpeg4_url: `${web}/bot/win-ru.mp4`, thumbnail_url: `${web}/bot/win-ru.jpg` });
    expect(ru.caption).toContain('Победа <b>8 420 : 6 100</b>');
    expect(ru.caption).toContain('Соперник: &lt;Марк&gt;');
    expect(ru.reply_markup.inline_keyboard[0]![0]).toMatchObject({ text: 'Сыграть со мной', url: 'https://t.me/b/app' });
    const en = resultCard({ gameId: 'Abcde12345', lang: 'en', outcome: 'draw', me: 6200, opp: 6200, opponent: 'Ilya', link: 'https://t.me/b/app', webAppUrl: web });
    expect(en.mpeg4_url).toBe(`${web}/bot/draw-en.mp4`);
    expect(en.caption).toContain('Draw <b>6,200 : 6,200</b>');
  });
});
