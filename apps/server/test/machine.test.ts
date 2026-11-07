import { describe, expect, it } from 'vitest';
import { pointsFor, TIMINGS } from '@quiz-duel/shared';
import { loadQuestionBank } from '../src/questions/bank.js';
import { pickQuestions } from '../src/game/picker.js';
import { seededRng } from '../src/game/rng.js';
import {
  answer,
  cancel,
  createGame,
  forfeit,
  isRated,
  join,
  leaveLobby,
  nextWakeAt,
  outcomeFor,
  setPresence,
  setReady,
  tick,
  type GameState,
  type MachineDeps,
  type Step,
} from '../src/game/machine.js';
import { viewFor } from '../src/game/view.js';
import { duelFacts } from '../src/game/facts.js';

const bank = loadQuestionBank();
const deps: MachineDeps = {
  correctOf: (id) => bank.byId.get(id)!.correct,
  pickQuestions: (s) => pickQuestions({ bank, category: s.category, rng: seededRng(42) }),
};

const ILYA = 1;
const MARK = 2;
const ANNA = 3;
const T0 = 1_800_000_000_000;

/** Успешный шаг или падение теста с кодом ошибки. */
function ok(step: Step): GameState {
  if (!step.ok) throw new Error(`ожидался успех, получено ${step.error}`);
  return step.state;
}

/** Позиция верного / неверного варианта текущего вопроса на экране. */
function positionOf(s: GameState, correct: boolean): number {
  const q = s.questions[s.questionIndex]!;
  const right = q.order.indexOf(bank.byId.get(q.id)!.correct);
  return correct ? right : (right + 1) % 4;
}

/** Дуэль по ссылке: Илья создал, Марк вошёл, оба готовы. Возвращает состояние на старте вопроса 1. */
function startedDuel(now = T0): { s: GameState; now: number } {
  let s = createGame({ id: 'g1', mode: 'link', category: 'mix', creatorId: ILYA }, now, deps);
  s = ok(join(s, MARK, now + 1000));
  s = ok(setReady(s, ILYA, true, now + 2000, deps));
  s = ok(setReady(s, MARK, true, now + 3000, deps));
  expect(s.phase).toBe('countdown');
  const start = now + 3000 + TIMINGS.countdownMs;
  s = ok(tick(s, start, deps));
  expect(s.phase).toBe('question');
  return { s, now: start };
}

describe('полная партия', () => {
  it('создание → лобби → отсчёт → 10 × (вопрос → раскрытие) → итоги', () => {
    let s = createGame({ id: 'g1', mode: 'link', category: 'mix', creatorId: ILYA }, T0, deps);
    expect(s.phase).toBe('waiting');
    s = ok(join(s, MARK, T0 + 1000));
    expect(s.phase).toBe('lobby');
    s = ok(setReady(s, ILYA, true, T0 + 2000, deps));
    expect(s.phase).toBe('lobby');
    const r = setReady(s, MARK, true, T0 + 3000, deps);
    s = ok(r);
    expect(r.ok && r.events.map((e) => e.type)).toEqual(['ready', 'countdown']);
    expect(s.questions).toHaveLength(10);
    expect(nextWakeAt(s)).toBe(T0 + 3000 + TIMINGS.countdownMs);

    let now = T0 + 3000 + TIMINGS.countdownMs;
    s = ok(tick(s, now, deps));
    let expectIlya = 0;
    let expectMark = 0;
    for (let i = 0; i < 10; i++) {
      expect(s.phase).toBe('question');
      expect(s.questionIndex).toBe(i);
      // Илья всегда верно за 2 с, Марк верно через раз за 6 с
      s = ok(answer(s, ILYA, i, positionOf(s, true), now + 2000, deps));
      expect(s.phase).toBe('question');
      s = ok(answer(s, MARK, i, positionOf(s, i % 2 === 0), now + 6000, deps));
      // ответили оба - раскрытие сразу, не дожидаясь 15 с
      expect(s.phase).toBe('reveal');
      expect(s.phaseEndsAt).toBe(now + 6000 + TIMINGS.revealMs);
      expectIlya += pointsFor(true, 2000);
      expectMark += i % 2 === 0 ? pointsFor(true, 6000) : 0;
      expect(s.creator.score).toBe(expectIlya);
      expect(s.opponent!.score).toBe(expectMark);
      now = s.phaseEndsAt!;
      s = ok(tick(s, now, deps));
    }
    expect(s.phase).toBe('finished');
    expect(s.finish).toEqual({ reason: 'completed', winnerId: ILYA, at: now });
    expect(outcomeFor(s, ILYA)).toBe('win');
    expect(outcomeFor(s, MARK)).toBe('loss');
    expect(isRated(s)).toBe(true);
    expect(s.creator.score).toBe(10 * 933); // 500 + 500 × 13/15 за ответ через 2 с
    expect(nextWakeAt(s)).toBeNull();
  });

  it('ничья при равном счёте, без тай-брейка', () => {
    let { s, now } = startedDuel();
    for (let i = 0; i < 10; i++) {
      s = ok(answer(s, ILYA, i, positionOf(s, true), now + 3000, deps));
      s = ok(answer(s, MARK, i, positionOf(s, true), now + 3000, deps));
      now = s.phaseEndsAt!;
      s = ok(tick(s, now, deps));
    }
    expect(s.finish?.winnerId).toBeNull();
    expect(outcomeFor(s, ILYA)).toBe('draw');
    expect(outcomeFor(s, MARK)).toBe('draw');
  });

  it('операции не меняют исходное состояние, rev растёт', () => {
    const { s } = startedDuel();
    const before = structuredClone(s);
    const next = ok(answer(s, ILYA, 0, 0, s.questionStartedAt! + 1000, deps));
    expect(s).toEqual(before);
    expect(next.rev).toBe(s.rev + 1);
  });
});

describe('вход по ссылке и лобби', () => {
  const fresh = () => createGame({ id: 'g1', mode: 'link', category: 'sport', creatorId: ILYA }, T0, deps);

  it('создатель открыл свою ссылку - остаётся в своём лобби, соперником не становится', () => {
    const r = join(fresh(), ILYA, T0 + 10);
    expect(r.ok && r.state.phase).toBe('waiting');
    expect(r.ok && r.state.opponent).toBeNull();
  });

  it('третий открыл ссылку - «Партия уже занята»', () => {
    const s = ok(join(fresh(), MARK, T0 + 10));
    expect(join(s, ANNA, T0 + 20)).toEqual({ ok: false, error: 'taken' });
  });

  it('двое одновременно: от одной и той же версии место получает только первый применённый', () => {
    const base = fresh();
    const first = ok(join(base, MARK, T0 + 10));
    // Сервер применяет изменения партии строго по очереди: второй вход видит уже занятое место.
    expect(join(first, ANNA, T0 + 10)).toEqual({ ok: false, error: 'taken' });
  });

  it('соперник повторно открыл ссылку - ничего не меняется', () => {
    const s = ok(join(fresh(), MARK, T0 + 10));
    const again = join(s, MARK, T0 + 20);
    expect(again.ok && again.state).toBe(s);
  });

  it('ссылка на завершённую / истёкшую / отменённую игру', () => {
    expect(join(ok(cancel(fresh(), ILYA)), MARK, T0)).toEqual({ ok: false, error: 'cancelled' });
    expect(join(ok(tick(fresh(), T0 + TIMINGS.lobbyTtlMs, deps)), MARK, T0)).toEqual({ ok: false, error: 'expired' });
    let { s } = startedDuel();
    s = ok(forfeit(s, MARK, s.questionStartedAt! + 100));
    expect(join(s, ANNA, T0)).toEqual({ ok: false, error: 'finished' });
  });

  it('соперник так и не пришёл - лобби истекает через 15 минут', () => {
    const s = fresh();
    expect(nextWakeAt(s)).toBe(T0 + TIMINGS.lobbyTtlMs);
    expect(ok(tick(s, T0 + TIMINGS.lobbyTtlMs - 1, deps)).phase).toBe('waiting');
    const r = tick(s, T0 + TIMINGS.lobbyTtlMs, deps);
    expect(r.ok && r.state.phase).toBe('expired');
    expect(r.ok && r.events).toEqual([{ type: 'expired' }]);
  });

  it('действия в лобби продлевают его жизнь', () => {
    let s = ok(join(fresh(), MARK, T0 + 10 * 60_000));
    s = ok(setReady(s, MARK, true, T0 + 14 * 60_000, deps));
    expect(ok(tick(s, T0 + 20 * 60_000, deps)).phase).toBe('lobby');
  });

  it('соперник зашёл и ушёл до «Готов»: через 60 с офлайна место освобождается, ссылка снова работает', () => {
    let s = ok(join(fresh(), MARK, T0 + 1000));
    s = ok(setPresence(s, MARK, false, T0 + 2000));
    expect(nextWakeAt(s)).toBe(T0 + 2000 + TIMINGS.lobbyOfflineMs);
    expect(ok(tick(s, T0 + 61_999, deps)).opponent?.userId).toBe(MARK);
    const r = tick(s, T0 + 62_000, deps);
    s = ok(r);
    expect(s.phase).toBe('waiting');
    expect(s.opponent).toBeNull();
    expect(r.ok && r.events).toEqual([{ type: 'seatFreed', userId: MARK }]);
    expect(ok(join(s, ANNA, T0 + 70_000)).opponent?.userId).toBe(ANNA);
  });

  it('соперник вернулся до 60 с - место за ним', () => {
    let s = ok(join(fresh(), MARK, T0 + 1000));
    s = ok(setPresence(s, MARK, false, T0 + 2000));
    s = ok(setPresence(s, MARK, true, T0 + 50_000));
    expect(ok(tick(s, T0 + 100_000, deps)).opponent?.userId).toBe(MARK);
  });

  it('создатель ушёл из лобби - лобби живёт до истечения, место не освобождается', () => {
    let s = ok(join(fresh(), MARK, T0 + 1000));
    s = ok(setPresence(s, ILYA, false, T0 + 2000));
    s = ok(tick(s, T0 + 10 * 60_000, deps));
    expect(s.phase).toBe('lobby');
    expect(s.creator.online).toBe(false);
  });

  it('соперник нажал «Уйти» - место свободно сразу', () => {
    const s = ok(leaveLobby(ok(join(fresh(), MARK, T0 + 1000)), MARK, T0 + 2000));
    expect(s.phase).toBe('waiting');
    expect(leaveLobby(s, ILYA, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('«Готов» снимается до старта; снятие во время отсчёта возвращает в лобби', () => {
    let s = ok(join(fresh(), MARK, T0 + 1000));
    s = ok(setReady(s, ILYA, true, T0 + 2000, deps));
    s = ok(setReady(s, ILYA, false, T0 + 3000, deps));
    expect(s.creator.ready).toBe(false);
    s = ok(setReady(s, ILYA, true, T0 + 4000, deps));
    s = ok(setReady(s, MARK, true, T0 + 5000, deps));
    expect(s.phase).toBe('countdown');
    s = ok(setReady(s, MARK, false, T0 + 6000, deps));
    expect(s.phase).toBe('lobby');
    expect(s.phaseEndsAt).toBeNull();
    // после первого вопроса снять «Готов» уже нельзя
    const started = startedDuel().s;
    expect(setReady(started, MARK, false, T0, deps)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('отменить может только создатель и только до старта', () => {
    const s = ok(join(fresh(), MARK, T0 + 1000));
    expect(cancel(s, MARK)).toEqual({ ok: false, error: 'not_creator' });
    expect(cancel(s, ANNA)).toEqual({ ok: false, error: 'not_participant' });
    expect(ok(cancel(s, ILYA))).toMatchObject({ phase: 'cancelled', cancelReason: 'creator' });
    expect(cancel(startedDuel().s, ILYA)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('посторонний не может ничего', () => {
    const { s } = startedDuel();
    expect(answer(s, ANNA, 0, 0, T0, deps)).toEqual({ ok: false, error: 'not_participant' });
    expect(setReady(s, ANNA, true, T0, deps)).toEqual({ ok: false, error: 'not_participant' });
    expect(forfeit(s, ANNA, T0)).toEqual({ ok: false, error: 'not_participant' });
    expect(setPresence(s, ANNA, false, T0)).toEqual({ ok: false, error: 'not_participant' });
  });
});

describe('ответы', () => {
  it('ответ идемпотентен: принимается первый, повтор отклоняется', () => {
    let { s, now } = startedDuel();
    s = ok(answer(s, ILYA, 0, positionOf(s, true), now + 1000, deps));
    expect(answer(s, ILYA, 0, positionOf(s, false), now + 1500, deps)).toEqual({ ok: false, error: 'already_answered' });
    expect(s.creator.answers[0]?.correct).toBe(true);
  });

  it('ответ на чужой или уже закрытый вопрос отклоняется по номеру и фазе', () => {
    let { s, now } = startedDuel();
    expect(answer(s, ILYA, 1, 0, now + 1000, deps)).toEqual({ ok: false, error: 'wrong_question' });
    s = ok(tick(s, now + TIMINGS.questionMs + TIMINGS.answerGraceMs, deps));
    expect(s.phase).toBe('reveal');
    expect(answer(s, ILYA, 0, 0, now + 16_000, deps)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('невалидная позиция варианта', () => {
    const { s, now } = startedDuel();
    for (const bad of [-1, 4, 1.5, Number.NaN]) {
      expect(answer(s, ILYA, 0, bad, now + 1000, deps)).toEqual({ ok: false, error: 'bad_option' });
    }
  });

  it('допуск 300 мс на сеть: ответ в допуске = 500 очков, позже - не засчитывается', () => {
    const { s, now } = startedDuel();
    const inGrace = ok(answer(s, ILYA, 0, positionOf(s, true), now + 15_200, deps));
    expect(inGrace.creator.answers[0]?.points).toBe(500);
    expect(answer(s, ILYA, 0, positionOf(s, true), now + 15_301, deps)).toEqual({ ok: false, error: 'late' });
  });

  it('время ответа считает сервер от старта вопроса', () => {
    const { s, now } = startedDuel();
    const a = ok(answer(s, MARK, 0, positionOf(s, true), now + 3_900, deps)).opponent!.answers[0]!;
    expect(a).toMatchObject({ timeMs: 3_900, points: 870, correct: true });
  });

  it('никто не ответил - вопрос закрывается через 15 с + допуск, обоим 0', () => {
    let { s, now } = startedDuel();
    expect(nextWakeAt(s)).toBe(now + 15_300);
    s = ok(tick(s, now + 15_300, deps));
    expect(s.phase).toBe('reveal');
    expect(s.creator.answers[0]).toBeNull();
    expect(s.opponent!.answers[0]).toBeNull();
    expect(s.phaseEndsAt).toBe(now + 15_300 + TIMINGS.revealMs);
  });

  it('ответил один - ждём второго до конца таймера', () => {
    let { s, now } = startedDuel();
    const r = answer(s, ILYA, 0, positionOf(s, true), now + 1000, deps);
    s = ok(r);
    expect(r.ok && r.events).toEqual([{ type: 'opponentAnswered', userId: ILYA, index: 0 }]);
    expect(s.phase).toBe('question');
    s = ok(tick(s, now + 15_300, deps));
    expect(s.phase).toBe('reveal');
    expect(s.opponent!.answers[0]).toBeNull();
  });
});

describe('отключения и возврат', () => {
  it('игрок свернул приложение на 5 с - партия идёт, техпобеды нет', () => {
    let { s, now } = startedDuel();
    s = ok(setPresence(s, MARK, false, now + 1000));
    expect(s.opponent!.graceEndsAt).toBe(now + 1000 + TIMINGS.reconnectGraceMs);
    s = ok(setPresence(s, MARK, true, now + 6000));
    expect(s.opponent!.graceEndsAt).toBeNull();
    s = ok(tick(s, now + 60_000, deps));
    expect(s.phase).not.toBe('finished');
  });

  it('соперник отключился посреди партии: таймеры идут, ему 0 очков, через 30 с техническая победа', () => {
    let { s, now } = startedDuel();
    s = ok(answer(s, ILYA, 0, positionOf(s, true), now + 1000, deps));
    s = ok(setPresence(s, MARK, false, now + 2000));
    const graceEnd = now + 2000 + 30_000;
    expect(nextWakeAt(s)).toBe(now + 15_300); // сначала закроется вопрос
    s = ok(tick(s, now + 15_300, deps));
    expect(s.opponent!.answers[0]).toBeNull();
    const r = tick(s, graceEnd, deps);
    s = ok(r);
    expect(s.phase).toBe('finished');
    expect(s.finish).toEqual({ reason: 'abandoned', winnerId: ILYA, at: graceEnd });
    expect(r.ok && r.events.at(-1)).toEqual({ type: 'finished', reason: 'abandoned', winnerId: ILYA });
  });

  it('соперник вернулся до истечения 30 с - отсчёт сбрасывается, игра продолжается с текущего вопроса', () => {
    let { s, now } = startedDuel();
    s = ok(setPresence(s, MARK, false, now + 1000));
    s = ok(setPresence(s, MARK, true, now + 25_000));
    s = ok(tick(s, now + 40_000, deps));
    expect(s.phase).not.toBe('finished');
    expect(s.questionIndex).toBeGreaterThan(0);
  });

  it('ушли оба - отсчёт стоит, партия доигрывается по таймерам; без ответов - отмена без рейтинга', () => {
    let { s, now } = startedDuel();
    s = ok(setPresence(s, MARK, false, now + 1000));
    s = ok(setPresence(s, ILYA, false, now + 2000));
    expect(s.creator.graceEndsAt).toBeNull();
    expect(s.opponent!.graceEndsAt).toBeNull();
    s = ok(tick(s, now + 10 * 60_000, deps));
    expect(s.phase).toBe('cancelled');
    expect(s.cancelReason).toBe('no_answers');
    expect(isRated(s)).toBe(false);
  });

  it('ушли оба, но ответы были - доигрывается до конца обычным итогом', () => {
    let { s, now } = startedDuel();
    s = ok(answer(s, MARK, 0, positionOf(s, true), now + 1000, deps));
    s = ok(setPresence(s, MARK, false, now + 2000));
    s = ok(setPresence(s, ILYA, false, now + 3000));
    s = ok(tick(s, now + 10 * 60_000, deps));
    expect(s.finish).toMatchObject({ reason: 'completed', winnerId: MARK });
  });

  it('один ушёл, потом второй - у первого отсчёт встаёт; второй вернулся - у первого новые 30 с', () => {
    let { s, now } = startedDuel();
    s = ok(setPresence(s, MARK, false, now + 1000));
    s = ok(setPresence(s, ILYA, false, now + 5000));
    expect(s.opponent!.graceEndsAt).toBeNull();
    s = ok(setPresence(s, ILYA, true, now + 40_000));
    expect(s.opponent!.graceEndsAt).toBe(now + 40_000 + 30_000);
    expect(ok(tick(s, now + 69_999, deps)).phase).not.toBe('finished');
    expect(ok(tick(s, now + 70_000, deps)).finish).toMatchObject({ reason: 'abandoned', winnerId: ILYA });
  });

  it('«Выйти из партии» - сдача: сразу техническая победа сопернику, без 30 с ожидания', () => {
    let { s, now } = startedDuel();
    const r = forfeit(s, ILYA, now + 500);
    s = ok(r);
    expect(s.finish).toEqual({ reason: 'forfeit', winnerId: MARK, at: now + 500 });
    expect(outcomeFor(s, ILYA)).toBe('loss');
    expect(isRated(s)).toBe(true); // техническое поражение = обычное поражение
  });

  it('перезапуск сервера: просроченные фазы закрываются сразу, по порядку дедлайнов', () => {
    let { s, now } = startedDuel();
    s = ok(answer(s, ILYA, 0, positionOf(s, true), now + 1000, deps));
    // сервер «лежал» 2 минуты: вопрос 1 закрыт, дальше вопросы по таймерам без ответов
    const r = tick(s, now + 120_000, deps);
    s = ok(r);
    const step = TIMINGS.questionMs + TIMINGS.answerGraceMs + TIMINGS.revealMs;
    expect(s.questionIndex).toBe(Math.floor(120_000 / step));
    expect(s.creator.score).toBe(pointsFor(true, 1000));
    expect(r.ok && r.events.filter((e) => e.type === 'reveal').length).toBe(s.closed);
    // и после долгого простоя партия заканчивается обычным итогом
    s = ok(tick(s, now + 60 * 60_000, deps));
    expect(s.finish).toMatchObject({ reason: 'completed', winnerId: ILYA });
  });
});

describe('реванш и тренировка', () => {
  it('реванш: согласие обоих уже есть - сразу отсчёт', () => {
    const s = createGame({ id: 'g2', mode: 'rematch', category: 'tech', creatorId: MARK, opponentId: ILYA, startNow: true, rematchOf: 'g1' }, T0, deps);
    expect(s.phase).toBe('countdown');
    expect(s.questions).toHaveLength(10);
    expect(s.rematchOf).toBe('g1');
  });

  it('быстрая игра: оба в лобби, «Готов» не нажат', () => {
    const s = createGame({ id: 'g3', mode: 'quick', category: 'mix', creatorId: ILYA, opponentId: MARK }, T0, deps);
    expect(s.phase).toBe('lobby');
    expect([s.creator.ready, s.opponent!.ready]).toEqual([false, false]);
  });

  it('тренировка: сразу вопрос, закрывается после своего ответа, без рейтинга', () => {
    let s = createGame({ id: 's1', mode: 'solo', category: 'science', creatorId: ILYA }, T0, deps);
    expect(s.phase).toBe('question');
    let now = T0;
    for (let i = 0; i < 10; i++) {
      s = ok(answer(s, ILYA, i, positionOf(s, true), now + 4000, deps));
      expect(s.phase).toBe('reveal');
      now = s.phaseEndsAt!;
      s = ok(tick(s, now, deps));
    }
    expect(s.phase).toBe('finished');
    expect(s.creator.score).toBe(10 * pointsFor(true, 4000));
    expect(isRated(s)).toBe(false);
    expect(join(s, MARK, now)).toEqual({ ok: false, error: 'finished' });
  });

  it('тренировка: «Выйти» - на главную без сохранения', () => {
    const s = createGame({ id: 's1', mode: 'solo', category: 'sport', creatorId: ILYA }, T0, deps);
    expect(ok(forfeit(s, ILYA, T0 + 100))).toMatchObject({ phase: 'cancelled', cancelReason: 'left' });
  });

  it('тренировка: отключение не даёт технической победы', () => {
    let s = createGame({ id: 's1', mode: 'solo', category: 'sport', creatorId: ILYA }, T0, deps);
    s = ok(setPresence(s, ILYA, false, T0 + 100));
    expect(s.creator.graceEndsAt).toBeNull();
  });
});

describe('снимок для клиента', () => {
  it('во время вопроса верный ответ не уходит на клиент ни в каком виде', () => {
    let { s, now } = startedDuel();
    s = ok(answer(s, MARK, 0, positionOf(s, true), now + 1000, deps));
    for (const viewer of [ILYA, MARK]) {
      const v = viewFor(s, viewer, 'ru', bank, now + 1500)!;
      expect(v.phase).toBe('question');
      expect(v.reveal).toBeNull();
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/correct|"option"|"points"|order/);
    }
    // Илья видит только факт ответа Марка, но не вариант
    const ilya = viewFor(s, ILYA, 'ru', bank, now + 1500)!;
    expect(ilya.opponentAnswered).toBe(true);
    expect(ilya.myAnswer).toBeNull();
    expect(viewFor(s, MARK, 'ru', bank, now + 1500)!.myAnswer).toEqual({ position: positionOf(s, true) });
  });

  it('варианты в порядке экрана, текст на языке игрока', () => {
    const { s } = startedDuel();
    const q = s.questions[0]!;
    const src = bank.byId.get(q.id)!;
    const en = viewFor(s, ILYA, 'en', bank, T0)!.question!;
    const ru = viewFor(s, MARK, 'ru', bank, T0)!.question!;
    expect(en.text).toBe(src.en.text);
    expect(en.options).toEqual(q.order.map((o) => src.en.options[o]));
    expect(ru.options).toEqual(q.order.map((o) => src.ru.options[o]));
    expect({ index: en.index, total: en.total, endsAt: en.endsAt - en.startedAt }).toEqual({ index: 0, total: 10, endsAt: 15_000 });
  });

  it('счёт во время вопроса - без очков текущего, на раскрытии - с ними и верной позицией', () => {
    let { s, now } = startedDuel();
    s = ok(answer(s, ILYA, 0, positionOf(s, true), now + 3_900, deps));
    expect(viewFor(s, ILYA, 'ru', bank, now)!.me.score).toBe(0);
    s = ok(answer(s, MARK, 0, positionOf(s, false), now + 5_000, deps));
    const v = viewFor(s, ILYA, 'ru', bank, now + 5_000)!;
    expect(v.phase).toBe('reveal');
    expect(v.me.score).toBe(870);
    expect(v.reveal).toEqual({
      index: 0,
      correctPosition: positionOf(s, true),
      me: { position: positionOf(s, true), points: 870, timeMs: 3_900 },
      opponent: { position: positionOf(s, false), points: 0, timeMs: 5_000 },
    });
  });

  it('соперник офлайн - в снимке видно, когда техническая победа', () => {
    let { s, now } = startedDuel();
    s = ok(setPresence(s, MARK, false, now + 1000));
    const v = viewFor(s, ILYA, 'ru', bank, now + 1000)!;
    expect(v.opponent).toMatchObject({ online: false, graceEndsAt: now + 31_000 });
  });

  it('итог глазами каждого; посторонний снимка не получает', () => {
    const s = ok(forfeit(startedDuel().s, MARK, T0 + 7000));
    expect(viewFor(s, ILYA, 'ru', bank, T0)!.result).toMatchObject({ reason: 'forfeit', outcome: 'win', technical: true });
    expect(viewFor(s, MARK, 'ru', bank, T0)!.result).toMatchObject({ reason: 'forfeit', outcome: 'loss', technical: true });
    expect(viewFor(s, ILYA, 'ru', bank, T0)!.result).toMatchObject({ leaverId: MARK, stats: { correct: 0, played: 0, avgMs: null } });
    expect(viewFor(s, ANNA, 'ru', bank, T0)).toBeNull();
  });
});

describe('факты партии для статистики и ачивок', () => {
  it('доигранная партия: 10 ответов и счёт после каждого вопроса', () => {
    let { s, now } = startedDuel();
    for (let i = 0; i < 10; i++) {
      s = ok(answer(s, ILYA, i, positionOf(s, i < 5 ? false : true), now + 1500, deps));
      s = ok(answer(s, MARK, i, positionOf(s, i < 5), now + 8000, deps));
      now = s.phaseEndsAt!;
      s = ok(tick(s, now, deps));
    }
    const f = duelFacts(s, ILYA);
    expect(f.answers).toHaveLength(10);
    expect(f.scoresAfter[4]![0]).toBeLessThan(f.scoresAfter[4]![1]); // отставал после 5-го
    expect(f.outcome).toBe('win'); // но выиграл - это «Камбэк»
    expect(f.technical).toBe(false);
  });

  it('сдача посреди вопроса: ответ на незакрытый вопрос не считается', () => {
    let { s, now } = startedDuel();
    s = ok(answer(s, ILYA, 0, positionOf(s, true), now + 1000, deps));
    s = ok(answer(s, MARK, 0, positionOf(s, true), now + 1000, deps));
    now = s.phaseEndsAt!;
    s = ok(tick(s, now, deps));
    s = ok(answer(s, ILYA, 1, positionOf(s, true), now + 500, deps));
    s = ok(forfeit(s, MARK, now + 600));
    const f = duelFacts(s, ILYA);
    expect(f.answers).toHaveLength(1);
    expect(f.technical).toBe(true);
    expect(f.outcome).toBe('win');
  });

  it('rematchAfterLoss учитывается только в реванше', () => {
    const s = ok(forfeit(startedDuel().s, MARK, T0 + 7000));
    expect(duelFacts(s, ILYA, true).rematchAfterLoss).toBe(false);
  });
});
