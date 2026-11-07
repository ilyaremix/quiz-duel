import { describe, expect, it } from 'vitest';
import { CATEGORIES, type GameCategory } from '@quiz-duel/shared';
import { loadQuestionBank } from '../src/questions/bank.js';
import { MIX_PER_CATEGORY, pickQuestions } from '../src/game/picker.js';
import { seededRng, shuffle } from '../src/game/rng.js';

const bank = loadQuestionBank();
const q = (id: string) => bank.byId.get(id)!;

describe('подбор вопросов', () => {
  it.each<GameCategory>(['mix', ...CATEGORIES])('%s: 10 разных, 3/4/3, по возрастанию сложности', (category) => {
    for (let seed = 1; seed <= 30; seed++) {
      const picked = pickQuestions({ bank, category, rng: seededRng(seed) });
      expect(picked).toHaveLength(10);
      expect(new Set(picked.map((p) => p.id)).size).toBe(10);
      const levels = picked.map((p) => q(p.id).difficulty);
      expect(levels).toEqual(['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard']);
      if (category !== 'mix') expect(picked.every((p) => q(p.id).category === category)).toBe(true);
    }
  });

  it('«Микс»: не больше 2 вопросов из одной категории', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickQuestions({ bank, category: 'mix', rng: seededRng(seed) });
      const counts = new Map<string, number>();
      for (const p of picked) counts.set(q(p.id).category, (counts.get(q(p.id).category) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(MIX_PER_CATEGORY);
    }
  });

  it('сначала несыгранные: если хватает свежих, ни одного виденного', () => {
    // игроки видели 3 лёгких, 3 средних и 2 сложных вопроса «Спорта» из 6/8/6 - свежих хватает везде
    const seen = new Map(['spo-01', 'spo-02', 'spo-03', 'spo-07', 'spo-08', 'spo-09', 'spo-15', 'spo-16'].map((id, i) => [id, 1000 + i]));
    for (let seed = 1; seed <= 20; seed++) {
      const picked = pickQuestions({ bank, category: 'sport', seen, rng: seededRng(seed) });
      expect(picked.filter((p) => seen.has(p.id))).toEqual([]);
    }
  });

  it('свежих мало - добираем самыми давно сыгранными', () => {
    // все 6 лёгких «Науки» уже видели; самые давние - sci-04, sci-05, sci-06
    const seen = new Map([
      ['sci-01', 600],
      ['sci-02', 500],
      ['sci-03', 400],
      ['sci-04', 300],
      ['sci-05', 200],
      ['sci-06', 100],
    ]);
    const picked = pickQuestions({ bank, category: 'science', seen, rng: seededRng(7) });
    expect(
      picked
        .slice(0, 3)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['sci-04', 'sci-05', 'sci-06']);
  });

  it('всё уже видели - партия всё равно из 10 вопросов', () => {
    const seen = new Map(bank.all.map((x, i) => [x.id, i]));
    expect(pickQuestions({ bank, category: 'tech', seen, rng: seededRng(3) })).toHaveLength(10);
    expect(pickQuestions({ bank, category: 'mix', seen, rng: seededRng(3) })).toHaveLength(10);
  });

  it('разные сиды - разные партии (случайность действительно есть)', () => {
    const ids = new Set(
      Array.from({ length: 20 }, (_, s) =>
        pickQuestions({ bank, category: 'mix', rng: seededRng(s + 1) })
          .map((p) => p.id)
          .join(),
      ),
    );
    expect(ids.size).toBeGreaterThan(15);
  });

  it('без сида работает на криптостойком генераторе', () => {
    expect(pickQuestions({ bank, category: 'history' })).toHaveLength(10);
  });
});

describe('перемешивание вариантов', () => {
  it('порядок - перестановка 0..3', () => {
    for (const p of pickQuestions({ bank, category: 'mix', rng: seededRng(11) })) {
      expect([...p.order].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('верный ответ на экране оказывается на любой позиции примерно поровну', () => {
    const hits = [0, 0, 0, 0];
    for (let seed = 1; seed <= 400; seed++) {
      for (const p of pickQuestions({ bank, category: 'mix', rng: seededRng(seed) })) {
        hits[p.order.indexOf(q(p.id).correct)]!++;
      }
    }
    // 4000 вопросов: на каждую позицию около 1000
    for (const h of hits) expect(h).toBeGreaterThan(850);
  });

  it('shuffle не меняет исходный массив', () => {
    const src = [1, 2, 3, 4, 5];
    shuffle(src, seededRng(1));
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });
});
