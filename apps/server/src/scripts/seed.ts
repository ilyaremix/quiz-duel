// npm run db:seed - заливает data/questions.json в базу без запуска сервера.
// Сервер делает то же самое сам при каждом старте, поэтому на проде команда не нужна.
import { createPrisma } from '../db.js';
import { loadQuestionBank } from '../questions/bank.js';
import { syncQuestions } from '../questions/sync.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL не задан (раскомментируйте его в .env)');
  process.exit(1);
}

const prisma = createPrisma(url);
try {
  const bank = loadQuestionBank();
  const r = await syncQuestions(prisma, bank.all);
  console.log(`Вопросы: ${r.active} в файле, добавлено ${r.created}, обновлено ${r.updated}, выключено ${r.retired}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
