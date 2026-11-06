/**
 * Этап 8: тренировка с настоящим сокет-клиентом. Тот же движок (таймер, очки), без соперника
 * и рейтинга; рекорд категории и «Эрудит» пишутся одной транзакцией в конце.
 */
import { describe, expect, it } from 'vitest';
import { pointsFor, TIMINGS, type GameView } from '@quiz-duel/shared';
import { memoryPlayer } from '../src/game/repo.js';
import { bank, ilya, lobby, mark, player, stateWhere, until, world, type Player, type World } from './socketWorld.js';

/** Позиция верного варианта на экране игрока (Илья видит вопросы по-русски). */
function correctPos(v: GameView) {
  const q = bank.byId.get(v.question!.questionId)!;
  return v.question!.options.indexOf(q.ru.options[q.correct]!);
}

/** 10 вопросов тренировки: right(i) - отвечать ли верно, ответ через 3 с. */
async function playSolo(w: World, p: Player, gameId: string, right: (i: number) => boolean) {
  for (let i = 0; i < 10; i++) {
    const v = await stateWhere(p, `вопрос ${i + 1}`, (s) => s.id === gameId && s.phase === 'question' && s.question?.index === i);
    await w.clock.advance(3_000);
    const pos = right(i) ? correctPos(v) : (correctPos(v) + 1) % 4;
    const res = await p.socket.emitWithAck('game:answer', { gameId, questionIndex: i, optionIndex: pos });
    expect(res.ok && res.accepted).toBe(true);
    // Соперника нет - вопрос закрывается сразу после ответа.
    await stateWhere(p, `раскрытие ${i + 1}`, (s) => s.id === gameId && s.phase === 'reveal' && s.reveal?.index === i);
    await w.clock.advance(TIMINGS.revealMs);
  }
  return stateWhere(p, 'итог тренировки', (s) => s.id === gameId && s.phase === 'finished' && s.result?.solo != null);
}

async function startSolo(p: Player, category: 'science' | 'mix' = 'science') {
  const res = await p.socket.emitWithAck('solo:start', { category });
  if (!res.ok) throw new Error(res.error);
  p.states.push(res.game);
  return res.game;
}

describe('Этап 8: тренировка', () => {
  it('сразу первый вопрос, 15 с и очки за скорость; итог - счёт и первый рекорд, рейтинг не меняется', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const g = await startSolo(a);
    expect(g).toMatchObject({ mode: 'solo', phase: 'question', opponent: null, soloBest: null, question: { index: 0 } });
    expect(g.question!.endsAt - g.question!.startedAt).toBe(TIMINGS.questionMs);

    const fin = await playSolo(w, a, g.id, (i) => i < 7);
    // Время ответа считает сервер: ~3 с (плюс миллисекунды на доставку).
    expect(fin.me.score).toBeLessThanOrEqual(7 * pointsFor(true, 3_000));
    expect(fin.me.score).toBeGreaterThanOrEqual(7 * pointsFor(true, 3_300));
    expect(fin.result).toMatchObject({ rating: null, solo: { score: fin.me.score, prevBest: null, record: true }, stats: { correct: 7, played: 10 } });
    expect(w.repo.soloRuns.get(g.id)).toMatchObject({ userId: ilya.id, category: 'science', correct: 7 });
    // Рейтинг и статистика дуэлей не тронуты, верные ответы - только в «Эрудита».
    expect(w.repo.players.get(ilya.id)).toMatchObject({ rating: 1000, games: 0, totalCorrect: 7 });
    // После итога игрок не «в партии»: можно начать новую.
    expect(w.games.currentGameOf(ilya.id)).toBeNull();
  }, 20_000);

  it('вторая попытка видит рекорд в счёте; хуже рекорда - «До рекорда», лучше - новый рекорд', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const first = await playSolo(w, a, (await startSolo(a)).id, (i) => i < 6);
    const best = first.me.score;

    // Каждая попытка - новое подключение: лимит сокета 30 событий за 10 с рассчитан на живого игрока.
    const a2 = await player(w, ilya);
    const g2 = await startSolo(a2);
    expect(g2.soloBest).toBe(best);
    const worse = await playSolo(w, a2, g2.id, (i) => i < 3);
    expect(worse.result!.solo).toEqual({ score: worse.me.score, prevBest: best, record: false });

    const a3 = await player(w, ilya);
    const better = await playSolo(w, a3, (await startSolo(a3)).id, () => true);
    expect(better.result!.solo).toMatchObject({ prevBest: best, record: true });
    // В другой категории рекорда ещё нет.
    expect((await startSolo(a3, 'mix')).soloBest).toBeNull();
  }, 30_000);

  it('«Эрудит» за 100 верных ответов вместе с дуэлями; других ачивок тренировка не даёт', async () => {
    const w = await world();
    w.repo.players.set(ilya.id, memoryPlayer(ilya.id, { totalCorrect: 98 }));
    const a = await player(w, ilya);
    const fin = await playSolo(w, a, (await startSolo(a)).id, () => true);
    // 10 из 10 и ответы быстрее 2 с не считаются: «Идеальная партия» и «Молния» - только в дуэлях.
    expect(fin.result!.newAchievements).toEqual(['erudite']);
  }, 20_000);

  it('«Выйти» - на главную без сохранения; ушёл из приложения - техпобеды нет, вернулся в ту же тренировку', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const g = await startSolo(a);
    a.socket.disconnect();
    await w.clock.advance(TIMINGS.reconnectGraceMs + 1_000);
    const a2 = await player(w, ilya);
    expect(a2.hello.currentGameId).toBe(g.id);
    const back = await a2.socket.emitWithAck('game:sync', { gameId: g.id });
    // Партия шла по таймерам: первый вопрос закрыт без ответа, идёт второй.
    expect(back.ok && back.game).toMatchObject({ phase: 'question', question: { index: 1 } });

    const left = await a2.socket.emitWithAck('game:forfeit', { gameId: g.id });
    expect(left.ok && left.game).toMatchObject({ phase: 'cancelled', cancelReason: 'left' });
    expect(w.repo.soloRuns.size).toBe(0);
  }, 20_000);

  it('в двух партиях сразу нельзя: из лобби или дуэли - busy, из тренировки - ни дуэль, ни чужая ссылка', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const b = await player(w, mark);
    const gameId = await lobby(a, b);
    expect(await a.socket.emitWithAck('solo:start', { category: 'mix' })).toMatchObject({ ok: false, error: 'busy', busyGameId: gameId });
    expect(await b.socket.emitWithAck('solo:start', { category: 'mix' })).toMatchObject({ ok: false, error: 'busy', busyGameId: gameId });
    // Лобби при этом живо.
    expect((await a.socket.emitWithAck('game:sync', { gameId })).ok).toBe(true);
    await a.socket.emitWithAck('game:cancel', { gameId });

    const solo = await startSolo(b);
    expect(await b.socket.emitWithAck('game:create', { category: 'mix' })).toMatchObject({ ok: false, error: 'busy', busyGameId: solo.id });
    const other = await a.socket.emitWithAck('game:create', { category: 'mix' });
    if (!other.ok) throw new Error(other.error);
    expect(await b.socket.emitWithAck('game:join', { gameId: other.game.id })).toMatchObject({ ok: false, error: 'busy', busyGameId: solo.id });
    // Тренировку нельзя «занять» по ссылке.
    expect(await a.socket.emitWithAck('game:join', { gameId: solo.id })).toMatchObject({ ok: false, error: 'taken' });
    expect(await a.socket.emitWithAck('game:react', { gameId: solo.id, emoji: '👍' })).toMatchObject({ ok: false, error: 'not_participant' });
  }, 20_000);

  it('без документов - consent_required; невалидная категория - invalid', async () => {
    const w = await world();
    w.users.rows.get(ilya.id)!.docsVersion = null;
    const a = await player(w, ilya);
    expect(await a.socket.emitWithAck('solo:start', { category: 'mix' })).toMatchObject({ ok: false, error: 'consent_required' });
    expect(await a.socket.emitWithAck('solo:start', { category: 'cooking' } as never)).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('сервер упал между концом тренировки и записью итога - при старте итог досчитывается один раз', async () => {
    const w = await world();
    const a = await player(w, ilya);
    const g = await startSolo(a);
    w.repo.failNextSettle = true;
    // Отвечаем на все 10, итог не записался (сбой базы) - повтор через 2 с.
    for (let i = 0; i < 10; i++) {
      const v = await stateWhere(a, `вопрос ${i + 1}`, (s) => s.id === g.id && s.phase === 'question' && s.question?.index === i);
      await a.socket.emitWithAck('game:answer', { gameId: g.id, questionIndex: i, optionIndex: correctPos(v) });
      await w.clock.advance(TIMINGS.revealMs);
    }
    await stateWhere(a, 'итог без рекорда', (s) => s.phase === 'finished' && s.result?.solo === null);
    await w.clock.advance(2_000);
    const fin = await until(() => a.states.find((s) => s.phase === 'finished' && s.result?.solo), 'итог после повтора');
    expect(fin.result!.solo).toMatchObject({ record: true });
    expect(w.repo.soloRuns.size).toBe(1);
  }, 20_000);
});
