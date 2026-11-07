/**
 * Этап 8: inline-режим. «@бот» в любом чате → карточка «Вызов на дуэль» с кнопкой «Принять»,
 * которая ведёт в лобби. Дальше - обычная дуэль по ссылке.
 */
import { describe, expect, it } from 'vitest';
import { gameIdFromStartParam } from '@quiz-duel/shared';
import { inlineAnswer } from '../src/bot/index.js';
import { anya, ilya, lobby, mark, player, start, stateWhere, world } from './socketWorld.js';

const WEB = 'https://quiz.example.sslip.io';

const linkOf = (answer: Awaited<ReturnType<typeof inlineAnswer>>) => {
  const btn = answer.results[0]!.reply_markup.inline_keyboard[0]![0] as { url: string };
  return btn.url;
};

describe('Этап 8: inline-режим', () => {
  it('создатель не в приложении: карточка → игра «Микс», соперник открыл ссылку - лобби, создатель «не в сети»', async () => {
    const w = await world();
    const answer = await inlineAnswer(w.games, w.users, ilya, WEB);
    expect(answer.options).toMatchObject({ cache_time: 0, is_personal: true });
    // Анимированная карточка с сайта; подпись - кто зовёт и правила партии.
    expect(answer.results[0]).toMatchObject({
      type: 'mpeg4_gif',
      title: 'Вызов на дуэль · Микс',
      mpeg4_url: `${WEB}/bot/invite-ru.mp4`,
      thumbnail_url: `${WEB}/bot/invite-ru.jpg`,
      parse_mode: 'HTML',
    });
    expect(answer.results[0]!.caption).toContain('Илья вызывает вас на дуэль');
    expect(answer.results[0]!.caption).toContain('Микс · Классика · 10 вопросов по 15 секунд');
    const url = linkOf(answer);
    const gameId = gameIdFromStartParam(new URL(url).searchParams.get('startapp'))!;
    expect(url).toBe(`https://t.me/quiz_test_bot/play?startapp=g_${gameId}`);

    // Повторный запрос (Telegram шлёт его на каждую букву) - та же игра, новой не создаётся.
    expect(linkOf(await inlineAnswer(w.games, w.users, ilya, WEB))).toBe(url);
    expect(w.repo.rows.size).toBe(1);

    const b = await player(w, mark);
    const joined = await b.socket.emitWithAck('game:join', { gameId });
    expect(joined.ok && joined.game).toMatchObject({ phase: 'lobby', category: 'mix', opponent: { userId: ilya.id, online: false } });

    // Создатель открыл приложение (через меню бота) - сразу в своём лобби, дальше обычная дуэль.
    const a = await player(w, ilya);
    expect(a.hello.currentGameId).toBe(gameId);
    await stateWhere(b, 'создатель в сети', (v) => v.opponent?.online === true);
    await start(w, a, b, gameId);
  });

  it('лобби уже есть (создано в приложении) - карточка ведёт в него', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const created = await a.socket.emitWithAck('game:create', { category: 'sport' });
    if (!created.ok) throw new Error(created.error);
    const answer = await inlineAnswer(w.games, w.users, ilya, WEB);
    expect(linkOf(answer)).toContain(`g_${created.game.id}`);
    expect(answer.results[0]!.title).toContain('Спорт');
  });

  it('без документов, посреди партии или в лобби с соперником - вместо карточки кнопка «Открыть»', async () => {
    const w = await world();
    w.users.rows.get(anya.id)!.docsVersion = null;
    const noDocs = await inlineAnswer(w.games, w.users, anya, WEB);
    expect(noDocs.results).toEqual([]);
    expect(noDocs.options.button).toEqual({ text: 'Откройте Quiz Duel и примите документы', web_app: { url: WEB } });

    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    const withOpp = await inlineAnswer(w.games, w.users, ilya, WEB);
    expect(withOpp.results).toEqual([]);
    expect(withOpp.options.button?.text).toBe('У вас идёт партия - вернуться в игру');
    // Лобби с соперником не тронуто.
    expect((await a.socket.emitWithAck('game:sync', { gameId })).ok).toBe(true);
    await start(w, a, b, gameId);
    const busy = await inlineAnswer(w.games, w.users, mark, WEB);
    expect(busy.options.button?.text).toBe('You have a game in progress - go back');
  });

  it('новый игрок (ни разу не открывал игру) - записывается в базу и видит кнопку «Открыть»', async () => {
    const w = await world();
    const stranger = { id: 777, first_name: 'Новичок', language_code: 'en' };
    const answer = await inlineAnswer(w.games, w.users, stranger, WEB);
    expect(w.users.rows.has(777)).toBe(true);
    expect(answer.options.button?.text).toBe('Open Quiz Duel and accept the documents');
  });
});
