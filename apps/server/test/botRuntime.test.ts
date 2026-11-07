/**
 * Живучесть бота: опрос Telegram перезапускается сам после сбоя (409 при выкатке, сеть),
 * inline-запросы не держат общую очередь, Telegram не принял ролик - карточка уходит текстом.
 */
import { describe, expect, it, vi } from 'vitest';
import { attachInline, botCommands, botHealth, inlineAnswer, syncChatCommands, startBot, type QuizBot } from '../src/bot/index.js';
import { ilya, mark, silentLog, world } from './socketWorld.js';

const WEB = 'https://quiz.example.sslip.io';

/** Ошибка Bot API, как её бросает grammY. */
const apiError = (code: number, description: string) => Object.assign(new Error(`Call to 'x' failed! (${code}: ${description})`), { error_code: code, description });

/** Подделка бота: start() по очереди отдаёт заготовленные исходы, stop() завершает текущий. */
function fakePollingBot(outcomes: Array<'fail409' | 'run'>) {
  let release: (() => void) | null = null;
  const calls: Array<{ drop: boolean | undefined }> = [];
  const bot = {
    catch: vi.fn(),
    start: vi.fn(async (opts: { drop_pending_updates?: boolean; onStart?: (info: { username: string }) => void }) => {
      calls.push({ drop: opts.drop_pending_updates });
      const next = outcomes.shift() ?? 'run';
      if (next === 'fail409') throw apiError(409, 'Conflict: terminated by other getUpdates request');
      opts.onStart?.({ username: 'quiz_test_bot' });
      await new Promise<void>((resolve) => (release = resolve));
    }),
    stop: vi.fn(async () => release?.()),
  };
  return { bot: bot as unknown as QuizBot, calls, raw: bot };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe('опрос Telegram', () => {
  it('409 при запуске - опрос перезапускается сам, старые обновления выбрасываются только в первый раз', async () => {
    const { bot, calls, raw } = fakePollingBot(['fail409', 'run']);
    const trouble = vi.fn();
    const before = botHealth().restarts;
    const poller = startBot(bot, silentLog, trouble, async () => undefined);
    await until(() => calls.length === 2 && botHealth().state === 'polling');
    expect(calls.map((c) => c.drop)).toEqual([true, false]);
    expect(botHealth().restarts).toBe(before + 1);
    expect(trouble).toHaveBeenCalledWith('polling', expect.stringContaining('409'));
    await poller.stop();
    // Остановили при выкатке - больше не перезапускается.
    await new Promise((r) => setTimeout(r, 20));
    expect(raw.start).toHaveBeenCalledTimes(2);
  });
});

/** Подделка ctx inline-запроса: answerInlineQuery может отвечать ошибкой. */
function fakeInlineBot() {
  let handler: ((ctx: unknown) => void) | null = null;
  const bot = { on: (_: string, h: (ctx: unknown) => void) => (handler = h) } as unknown as QuizBot;
  const query = (from: typeof ilya, answer: (results: Array<{ type: string }>) => Promise<unknown>) => {
    const answered: Array<Array<{ type: string }>> = [];
    const ctx = {
      from,
      answerInlineQuery: async (results: Array<{ type: string }>) => {
        answered.push(results);
        return answer(results);
      },
    };
    handler!(ctx);
    return answered;
  };
  return { bot, query };
}

describe('inline-режим: ответ не держит бота', () => {
  it('Telegram не принял ролик - та же карточка уходит текстом, владельцу - сообщение', async () => {
    const w = await world();
    const { bot, query } = fakeInlineBot();
    const trouble = vi.fn();
    attachInline(bot, w.games, w.users, WEB, silentLog, trouble);
    const answered = query(ilya, async (results) => {
      if (results[0]!.type === 'mpeg4_gif') throw apiError(400, 'Bad Request: WEBDOCUMENT_URL_INVALID');
      return true;
    });
    await until(() => answered.length === 2);
    expect(answered.map((r) => r[0]!.type)).toEqual(['mpeg4_gif', 'article']);
    expect(trouble).toHaveBeenCalledWith('inline', expect.stringContaining('WEBDOCUMENT_URL_INVALID'));
  });

  it('устаревший запрос (игрок печатает дальше) - не сбой: без второй попытки и без сообщения', async () => {
    const w = await world();
    const { bot, query } = fakeInlineBot();
    const trouble = vi.fn();
    attachInline(bot, w.games, w.users, WEB, silentLog, trouble);
    const answered = query(mark, async () => {
      throw apiError(400, 'Bad Request: query is too old and response timeout expired or query ID is invalid');
    });
    await until(() => answered.length === 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(answered).toHaveLength(1);
    expect(trouble).not.toHaveBeenCalled();
  });

  it('два запроса подряд от одного игрока - одна игра (запросы игрока идут по очереди)', async () => {
    const w = await world();
    const { bot, query } = fakeInlineBot();
    attachInline(bot, w.games, w.users, WEB, silentLog);
    const a = query(ilya, async () => true);
    const b = query(ilya, async () => true);
    await until(() => a.length === 1 && b.length === 1);
    expect(w.repo.rows.size).toBe(1);
  });

  it('запасная карточка - та же ссылка «Принять» и тот же текст вызова', async () => {
    const w = await world();
    const answer = await inlineAnswer(w.games, w.users, ilya, WEB);
    const [card] = answer.results;
    const [text] = answer.fallback;
    expect(text).toMatchObject({ type: 'article', title: '⚔️ Вызов на дуэль · Микс', thumbnail_url: `${WEB}/bot/invite-ru.jpg` });
    expect(text!.description).toBe('Микс · Классика · 10 вопросов по 15 секунд');
    expect(text!.input_message_content.message_text).toBe(card!.caption);
    expect(text!.reply_markup.inline_keyboard).toEqual(card!.reply_markup.inline_keyboard);
  });
});

describe('меню команд по языку игрока', () => {
  it('язык выбран - команды на нём в чате игрока; «авто» - убираем личное меню', async () => {
    const calls: unknown[][] = [];
    const api = {
      setMyCommands: async (...a: unknown[]) => void calls.push(['set', ...a]),
      deleteMyCommands: async (...a: unknown[]) => void calls.push(['del', ...a]),
    };
    await syncChatCommands({ api } as never, 42, 'en');
    await syncChatCommands({ api } as never, 42, null);
    expect(calls[0]).toEqual(['set', botCommands('en'), { scope: { type: 'chat', chat_id: 42 } }]);
    expect(calls[1]).toEqual(['del', { scope: { type: 'chat', chat_id: 42 } }]);
    expect(botCommands('en')[0]).toMatchObject({ command: 'start' });
    // Ошибка Telegram (игрок не запускал бота) не роняет сохранение настроек.
    const failing = { setMyCommands: async () => { throw new Error('chat not found'); } };
    await expect(syncChatCommands({ api: failing } as never, 1, 'ru')).resolves.toBeUndefined();
  });
});
