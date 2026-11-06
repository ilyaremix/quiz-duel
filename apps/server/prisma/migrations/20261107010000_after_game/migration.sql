-- Этап 7: итоги партии. settled_at - итоги посчитаны (повтор подсчёта ничего не меняет),
-- счётчики точности у игрока, статистика по категориям и полученные ачивки.

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "settled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "correct_time_ms" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "duel_correct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "questions_played" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "category_stats" (
    "user_id" BIGINT NOT NULL,
    "category" "Category" NOT NULL,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "category_stats_pkey" PRIMARY KEY ("user_id","category")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "user_id" BIGINT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "game_id" VARCHAR(10),
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id","code")
);

-- CreateIndex
CREATE INDEX "games_creator_id_finished_at_idx" ON "games"("creator_id", "finished_at" DESC);

-- CreateIndex
CREATE INDEX "games_opponent_id_finished_at_idx" ON "games"("opponent_id", "finished_at" DESC);

-- AddForeignKey
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

