-- Обновление 2.0: режим партии и её настройки (для истории и статистики режимов в админке).
ALTER TABLE "games" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN "time_sec" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN "question_count" INTEGER NOT NULL DEFAULT 10;
