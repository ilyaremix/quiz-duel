-- Обновление 2.0: админка - свои заголовки заданий и индекс событий по игроку.
ALTER TABLE "tasks" ADD COLUMN "title_ru" TEXT,
ADD COLUMN "title_en" TEXT;

CREATE INDEX "events_user_id_created_at_idx" ON "events"("user_id", "created_at");
