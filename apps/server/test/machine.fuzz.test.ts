import { describe, expect, it } from 'vitest';
import { FINAL_PHASES } from '@quiz-duel/shared';
import { loadQuestionBank } from '../src/questions/bank.js';
import { pickQuestions } from '../src/game/picker.js';
import { seededRng } from '../src/game/rng.js';
import {
  answer,
  cancel,
  createGame,
  forfeit,
  join,
  leaveLobby,
  nextWakeAt,
  participants,
  setPresence,
  setReady,
  tick,
  type GameState,
  type MachineDeps,
} from '../src/game/machine.js';
import { viewFor } from '../src/game/view.js';

const bank = loadQuestionBank();

/**
 * Случайные партии: случайные действия трёх людей в случайные моменты.
 * Машина не должна падать, а инварианты - нарушаться ни на одном шаге.
 */
describe('случайные партии (fuzz)', () => {
  it('500 партий: без исключений, инварианты держатся', { timeout: 60_000 }, () => {
    const outcomes = new Map<string, number>();
    for (let seed = 1; seed <= 500; seed++) {
      const rng = seededRng(seed);
      const deps: MachineDeps = {
        correctOf: (id) => bank.byId.get(id)!.correct,
        pickQuestions: (s) => pickQuestions({ bank, category: s.category, rng }),
      };
      const users = [1, 2, 3];
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
      let now = 1_800_000_000_000;
      let s: GameState = createGame({ id: `f${seed}`, mode: 'link', category: pick(['mix', 'sport', 'tech']), creatorId: 1 }, now, deps);

      for (let step = 0; step < 400 && !FINAL_PHASES.includes(s.phase); step++) {
        now += Math.floor(rng() ** 3 * 20_000);
        const u = pick(users);
        const actions = [
          () => join(s, u, now),
          () => setReady(s, u, rng() < 0.8, now, deps),
          () => setPresence(s, u, rng() < 0.6, now),
          () => answer(s, u, s.questionIndex + (rng() < 0.9 ? 0 : 1), Math.floor(rng() * 5) - (rng() < 0.05 ? 1 : 0), now, deps),
          () => answer(s, u, s.questionIndex, Math.floor(rng() * 4), now, deps),
          () => tick(s, now, deps),
          () => tick(s, now, deps),
          () => (rng() < 0.02 ? forfeit(s, u, now) : tick(s, now, deps)),
          () => (rng() < 0.02 ? cancel(s, u) : tick(s, now, deps)),
          () => (rng() < 0.03 ? leaveLobby(s, u, now) : tick(s, now, deps)),
        ];
        const prevRev = s.rev;
        const r = pick(actions)();
        if (r.ok) {
          expect(r.state.rev).toBeGreaterThanOrEqual(prevRev);
          s = r.state;
        }
        checkInvariants(s, now);
      }
      // В любом случае партия рано или поздно заканчивается сама.
      const end = tick(s, now + 24 * 60 * 60_000, deps);
      if (end.ok) s = end.state;
      expect(FINAL_PHASES).toContain(s.phase);
      expect(nextWakeAt(s)).toBeNull();
      const key = s.finish?.reason ?? s.cancelReason ?? s.phase;
      outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    }
    // Прогон действительно доходит до всех исходов, а не застревает в лобби.
    // (истечение лобби за 15 мин простоя здесь не случается - оно проверено отдельным тестом)
    for (const key of ['completed', 'forfeit', 'abandoned', 'creator', 'no_answers']) {
      expect(outcomes.get(key) ?? 0, `${key}: ${JSON.stringify([...outcomes])}`).toBeGreaterThan(0);
    }
  });
});

function checkInvariants(s: GameState, now: number) {
  // Счёт = сумма очков закрытых вопросов
  for (const p of participants(s)) {
    const sum = p.answers.slice(0, s.closed).reduce((acc, a) => acc + (a?.points ?? 0), 0);
    expect(p.score).toBe(sum);
    expect(p.answers.length).toBeLessThanOrEqual(10);
    for (const a of p.answers) if (a) expect(a.points).toBeLessThanOrEqual(1000);
  }
  // Создатель не может быть соперником
  if (s.opponent) expect(s.opponent.userId).not.toBe(s.creator.userId);
  // Номер вопроса в пределах, закрытых не больше начатых
  expect(s.questionIndex).toBeLessThan(10);
  expect(s.closed).toBeLessThanOrEqual(s.questionIndex + 1);
  // Партия идёт - вопросы выбраны
  if (['countdown', 'question', 'reveal', 'finished'].includes(s.phase)) expect(s.questions).toHaveLength(10);
  // В лобби и ожидании - нет активного вопроса
  if (s.phase === 'waiting') expect(s.opponent).toBeNull();
  // Снимок: во время вопроса никакой информации о верном ответе
  for (const p of participants(s)) {
    const v = viewFor(s, p.userId, 'en', bank, now)!;
    if (s.phase === 'question') {
      expect(v.reveal).toBeNull();
      expect(JSON.stringify(v)).not.toMatch(/correct/);
    }
  }
  // Отсчёт до технической победы бывает только посреди партии
  if (!['countdown', 'question', 'reveal'].includes(s.phase)) {
    for (const p of participants(s)) expect(p.graceEndsAt).toBeNull();
  }
  // Дедлайн - конечное число или его нет
  const wake = nextWakeAt(s);
  if (wake !== null) expect(Number.isFinite(wake)).toBe(true);
}
