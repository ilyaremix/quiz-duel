/**
 * Этап 8: уведомления от бота. Менеджер решает, кому и когда (только тем, у кого нет открытого
 * приложения, каждое - один раз за партию), отправщик - язык, разрешения и ошибки Telegram.
 */
import { describe, expect, it } from 'vitest';
import { TIMINGS } from '@quiz-duel/shared';
import type { GameAlert, GameAlerts } from '../src/game/manager.js';
import { botAlerts, type AlertApi } from '../src/bot/alerts.js';
import { ilya, lobby, mark, player, playOut, start, stateWhere, until, world } from './socketWorld.js';
import { memoryUsers } from './helpers.js';

function collector() {
  const sent: { userId: number; alert: GameAlert }[] = [];
  const alerts: GameAlerts = { send: (userId, alert) => sent.push({ userId, alert }) };
  return { sent, alerts, kinds: (userId: number) => sent.filter((s) => s.userId === userId).map((s) => s.alert.kind) };
}

describe('Этап 8: когда бот пишет игроку', () => {
  it('соперник зашёл в лобби, а создатель закрыл приложение - «Соперник в лобби»; в приложении - ничего', async () => {
    const c = collector();
    const w = await world({ alerts: c.alerts });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const created = await a.socket.emitWithAck('game:create', { category: 'mix' });
    if (!created.ok) throw new Error(created.error);
    a.socket.disconnect();
    await until(() => !w.games.isOnline(ilya.id), 'Илья офлайн');
    await b.socket.emitWithAck('game:join', { gameId: created.game.id });
    await until(() => c.sent.length > 0, 'уведомление');
    expect(c.sent).toEqual([{ userId: ilya.id, alert: { kind: 'joined', gameId: created.game.id, opponent: 'Марк' } }]);

    // Тот же сценарий, но создатель в приложении - не пишем.
    const c2 = collector();
    const w2 = await world({ alerts: c2.alerts });
    const a2 = await player(w2, ilya);
    const b2 = await player(w2, mark);
    await lobby(a2, b2);
    expect(c2.sent).toEqual([]);
  });

  it('соперник нажал «Готов», а игрока нет - «Соперник ждёт»; повторно не пишем', async () => {
    const c = collector();
    const w = await world({ alerts: c.alerts });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    b.socket.disconnect();
    await stateWhere(a, 'Марк офлайн', (v) => v.opponent?.online === false);
    await a.socket.emitWithAck('game:ready', { gameId, ready: true });
    await a.socket.emitWithAck('game:ready', { gameId, ready: false });
    await a.socket.emitWithAck('game:ready', { gameId, ready: true });
    expect(c.kinds(mark.id)).toEqual(['waitingLobby']);
    expect(c.kinds(ilya.id)).toEqual([]);
  });

  it('посреди партии пропал - «Вернитесь за 30 с» один раз; не вернулся - итог «Техническое поражение»', async () => {
    const c = collector();
    const w = await world({ alerts: c.alerts });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    await start(w, a, b, gameId);
    b.socket.disconnect();
    const off = await stateWhere(a, 'у Марка отсчёт', (v) => v.opponent?.graceEndsAt != null);
    expect(c.sent).toEqual([{ userId: mark.id, alert: { kind: 'waitingGame', gameId, opponent: 'Илья', until: off.opponent!.graceEndsAt } }]);

    // Вернулся и снова ушёл - второй раз не пишем (иначе каждое моргание сети - сообщение).
    const b2 = await player(w, mark);
    await stateWhere(a, 'Марк вернулся', (v) => v.opponent?.online === true && v.rev > off.rev);
    const revBack = a.states.at(-1)!.rev;
    b2.socket.disconnect();
    await stateWhere(a, 'Марк снова офлайн', (v) => v.opponent?.graceEndsAt != null && v.rev > revBack);
    await w.clock.advance(TIMINGS.reconnectGraceMs + 500);
    await stateWhere(a, 'техпобеда', (v) => v.phase === 'finished');
    await until(() => c.kinds(mark.id).includes('result'), 'итог Марку');
    expect(c.kinds(mark.id)).toEqual(['waitingGame', 'result']);
    expect(c.sent.find((s) => s.alert.kind === 'result')!.alert.result).toMatchObject({ outcome: 'loss', technical: true, delta: expect.any(Number) });
    // Победитель в приложении - ему не пишем.
    expect(c.kinds(ilya.id)).toEqual([]);
  }, 15_000);

  it('реванш предложен, соперник закрыл приложение - «Вам предлагают реванш»; вернулся по кнопке за 30 с - принял', async () => {
    const c = collector();
    const w = await world({ alerts: c.alerts });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    await start(w, a, b, gameId);
    await playOut(w, a, b, gameId);
    expect(c.sent).toEqual([]);

    await a.socket.emitWithAck('rematch:offer', { gameId });
    b.socket.disconnect();
    await until(() => c.kinds(mark.id).includes('rematch'), 'реванш Марку');
    expect(c.sent.at(-1)!.alert).toMatchObject({ kind: 'rematch', gameId, opponent: 'Илья', until: expect.any(Number) });

    // Кнопка бота открывает мини-апп по ссылке на эту партию: итоги с предложением, можно принять.
    const b2 = await player(w, mark);
    const back = await b2.socket.emitWithAck('game:join', { gameId });
    expect(back.ok && back.game.rematch).toMatchObject({ status: 'offered', byMe: false, canOffer: true });
    const ok = await b2.socket.emitWithAck('rematch:respond', { gameId, accept: true });
    expect(ok.ok).toBe(true);
    await stateWhere(a, 'новая партия', (v) => v.rematchOf === gameId && v.phase === 'countdown');
  }, 20_000);

  it('партия доиграна, игрок закрыл приложение до конца - итог партии с рейтингом', async () => {
    const c = collector();
    const w = await world({ alerts: c.alerts });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    await start(w, a, b, gameId);
    // Оба уходят: партия доигрывается по таймерам, ответ Ильи на первый вопрос не даёт её отменить.
    await a.socket.emitWithAck('game:answer', { gameId, questionIndex: 0, optionIndex: 0 });
    a.socket.disconnect();
    b.socket.disconnect();
    for (let i = 0; i < 12; i++) await w.clock.advance(TIMINGS.questionMs + TIMINGS.answerGraceMs + TIMINGS.revealMs);
    await until(() => c.sent.filter((s) => s.alert.kind === 'result').length === 2, 'итоги обоим');
    const res = c.sent.filter((s) => s.alert.kind === 'result');
    expect(res.map((r) => r.userId).sort()).toEqual([ilya.id, mark.id].sort());
    expect(res[0]!.alert.result).toMatchObject({ technical: false, ratingAfter: expect.any(Number) });
  }, 20_000);

  it('сбой отправки не мешает партии', async () => {
    const w = await world({ alerts: { send: () => { throw new Error('boom'); } } });
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    await start(w, a, b, gameId);
    b.socket.disconnect();
    await stateWhere(a, 'отсчёт', (v) => v.opponent?.graceEndsAt != null);
    await w.clock.advance(TIMINGS.reconnectGraceMs + 500);
    await stateWhere(a, 'техпобеда', (v) => v.phase === 'finished' && v.result?.outcome === 'win');
  }, 15_000);
});

describe('Этап 8: отправка уведомлений', () => {
  async function setup() {
    const users = memoryUsers();
    await users.upsertFromTelegram({ id: 1, first_name: 'Илья', language_code: 'ru', allows_write_to_pm: true });
    await users.upsertFromTelegram({ id: 2, first_name: 'Mark', language_code: 'en', allows_write_to_pm: true });
    await users.upsertFromTelegram({ id: 3, first_name: 'Аня', language_code: 'ru' });
    const calls: { chatId: number; text: string; url: string; button: string }[] = [];
    let fail: number | null = null;
    const api: AlertApi = {
      async sendMessage(chatId, text, other) {
        if (fail) throw Object.assign(new Error('Forbidden'), { error_code: fail });
        const btn = other.reply_markup.inline_keyboard[0]![0] as { text: string; url: string };
        calls.push({ chatId, text, url: btn.url, button: btn.text });
      },
    };
    const warns: object[] = [];
    const sender = botAlerts(api, users, 'https://t.me/q_battle_bot/QuizDuel', { warn: (o) => warns.push(o) });
    return { users, calls, sender, warns, failWith: (code: number | null) => (fail = code) };
  }

  it('на языке получателя, с кнопкой прямо в партию; имя экранируется', async () => {
    const { calls, sender } = await setup();
    sender.send(1, { kind: 'joined', gameId: 'Abcde12345', opponent: '<Mark>' });
    sender.send(2, { kind: 'result', gameId: 'Abcde12345', opponent: 'Илья', result: { outcome: 'win', technical: false, me: 6224, opp: 5027, ratingAfter: 1016, delta: 16 } });
    await sender.flush();
    expect(calls[0]).toMatchObject({ chatId: 1, url: 'https://t.me/q_battle_bot/QuizDuel?startapp=g_Abcde12345', button: 'Открыть лобби' });
    expect(calls[0]!.text).toContain('&lt;Mark&gt;');
    expect(calls[1]!.text).toContain('Victory - you vs <b>Илья</b>: 6,224 : 5,027');
    expect(calls[1]!.text).toContain('Rating 1,016 (+16)');
    expect(calls[1]!.button).toBe('Results');
  });

  it('не пишем, если бот не может писать или уведомления выключены', async () => {
    const { users, calls, sender } = await setup();
    await users.updateSettings(1, { notifications: false });
    sender.send(1, { kind: 'rematch', gameId: 'Abcde12345', opponent: 'Mark' });
    sender.send(3, { kind: 'rematch', gameId: 'Abcde12345', opponent: 'Mark' });
    sender.send(99, { kind: 'rematch', gameId: 'Abcde12345', opponent: 'Mark' });
    await sender.flush();
    expect(calls).toEqual([]);
  });

  it('Telegram ответил 403 (заблокировал бота) - больше не пишем; другая ошибка - только в лог', async () => {
    const { users, calls, sender, warns, failWith } = await setup();
    failWith(403);
    sender.send(1, { kind: 'waitingLobby', gameId: 'Abcde12345', opponent: 'Mark' });
    await sender.flush();
    expect(users.rows.get(1)!.writeAccess).toBe(false);
    failWith(500);
    sender.send(2, { kind: 'waitingLobby', gameId: 'Abcde12345', opponent: 'Илья' });
    await sender.flush();
    expect(users.rows.get(2)!.writeAccess).toBe(true);
    expect(warns).toHaveLength(1);
    expect(calls).toEqual([]);
  });
});
