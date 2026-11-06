import type { Question } from '@quiz-duel/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface SyncResult {
  /** Вопросов в файле (все активны). */
  active: number;
  /** Новых строк в таблице. */
  created: number;
  /** Изменившихся строк (текст, варианты, верный ответ, категория, сложность). */
  updated: number;
  /** Строк, которых больше нет в файле: помечены active = false. */
  retired: number;
}

function toRow(q: Question) {
  return {
    category: q.category,
    difficulty: q.difficulty,
    textRu: q.ru.text,
    textEn: q.en.text,
    optionsRu: q.ru.options,
    optionsEn: q.en.options,
    correctIndex: q.correct,
    active: true,
  };
}

type Row = ReturnType<typeof toRow>;

function sameRow(a: Row, b: Row): boolean {
  return (
    a.category === b.category &&
    a.difficulty === b.difficulty &&
    a.textRu === b.textRu &&
    a.textEn === b.textEn &&
    a.correctIndex === b.correctIndex &&
    a.active === b.active &&
    a.optionsRu.join('\u0000') === b.optionsRu.join('\u0000') &&
    a.optionsEn.join('\u0000') === b.optionsEn.join('\u0000')
  );
}

/**
 * Приводит таблицу questions к содержимому data/questions.json.
 * Идемпотентно: повторный запуск без изменений файла ничего не пишет.
 * Удалённые из файла вопросы не удаляются, а выключаются (active = false),
 * потому что на них могут ссылаться сыгранные партии.
 */
export async function syncQuestions(prisma: PrismaClient, questions: readonly Question[]): Promise<SyncResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.question.findMany();
    const current = new Map(existing.map((row) => [row.id, row]));
    const result: SyncResult = { active: questions.length, created: 0, updated: 0, retired: 0 };

    for (const q of questions) {
      const row = toRow(q);
      const old = current.get(q.id);
      if (!old) {
        await tx.question.create({ data: { id: q.id, ...row } });
        result.created++;
      } else if (!sameRow(old, row)) {
        await tx.question.update({ where: { id: q.id }, data: row });
        result.updated++;
      }
    }

    const ids = new Set(questions.map((q) => q.id));
    const stale = existing.filter((row) => row.active && !ids.has(row.id)).map((row) => row.id);
    if (stale.length > 0) {
      await tx.question.updateMany({ where: { id: { in: stale } }, data: { active: false } });
      result.retired = stale.length;
    }

    return result;
  });
}
