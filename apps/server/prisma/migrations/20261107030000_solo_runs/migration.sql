-- Этап 8: тренировки. Одна строка на доигранную попытку; лучший счёт по категории - личный рекорд.

-- CreateTable
CREATE TABLE "solo_runs" (
    "game_id" VARCHAR(10) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "category" "GameCategory" NOT NULL,
    "score" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solo_runs_pkey" PRIMARY KEY ("game_id")
);

-- CreateIndex
CREATE INDEX "solo_runs_user_id_category_score_idx" ON "solo_runs"("user_id", "category", "score" DESC);

-- AddForeignKey
ALTER TABLE "solo_runs" ADD CONSTRAINT "solo_runs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solo_runs" ADD CONSTRAINT "solo_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
