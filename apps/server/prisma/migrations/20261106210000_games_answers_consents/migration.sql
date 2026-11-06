-- CreateEnum
CREATE TYPE "GameCategory" AS ENUM ('mix', 'science', 'history', 'culture', 'sport', 'tech');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('link', 'quick', 'rematch', 'solo');

-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('waiting', 'lobby', 'countdown', 'question', 'reveal', 'finished', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "FinishReason" AS ENUM ('completed', 'forfeit', 'abandoned');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('creator', 'left', 'no_answers');

-- CreateEnum
CREATE TYPE "ConsentDoc" AS ENUM ('terms', 'privacy', 'pd_consent');

-- CreateTable
CREATE TABLE "games" (
    "id" VARCHAR(10) NOT NULL,
    "mode" "GameMode" NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "finish_reason" "FinishReason",
    "cancel_reason" "CancelReason",
    "category" "GameCategory" NOT NULL,
    "creator_id" BIGINT NOT NULL,
    "opponent_id" BIGINT,
    "question_ids" TEXT[],
    "option_orders" JSONB NOT NULL DEFAULT '[]',
    "question_index" INTEGER NOT NULL DEFAULT -1,
    "phase_ends_at" TIMESTAMP(3),
    "lobby_expires_at" TIMESTAMP(3),
    "creator_score" INTEGER NOT NULL DEFAULT 0,
    "opponent_score" INTEGER NOT NULL DEFAULT 0,
    "winner_id" BIGINT,
    "creator_rating_before" INTEGER,
    "creator_rating_delta" INTEGER,
    "opponent_rating_before" INTEGER,
    "opponent_rating_delta" INTEGER,
    "rematch_of" VARCHAR(10),
    "rev" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" BIGSERIAL NOT NULL,
    "game_id" VARCHAR(10) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "question_index" INTEGER NOT NULL,
    "question_id" TEXT NOT NULL,
    "option_index" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "time_ms" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "doc" "ConsentDoc" NOT NULL,
    "doc_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "games_phase_idx" ON "games"("phase");

-- CreateIndex
CREATE INDEX "games_creator_id_created_at_idx" ON "games"("creator_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "games_opponent_id_created_at_idx" ON "games"("opponent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "answers_user_id_idx" ON "answers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_game_id_user_id_question_index_key" ON "answers"("game_id", "user_id", "question_index");

-- CreateIndex
CREATE INDEX "consents_user_id_doc_doc_version_idx" ON "consents"("user_id", "doc", "doc_version");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ручные проверки целостности (Prisma не описывает CHECK в схеме, но и не трогает их).
-- id партии - ровно 10 символов [A-Za-z0-9]; соперник не может быть создателем;
-- в начатой партии ровно 10 вопросов.
ALTER TABLE "games" ADD CONSTRAINT "games_shape_check" CHECK (
    "id" ~ '^[A-Za-z0-9]{10}$'
    AND ("opponent_id" IS NULL OR "opponent_id" <> "creator_id")
    AND cardinality("question_ids") IN (0, 10)
    AND "question_index" BETWEEN -1 AND 9
);

-- Ответ: позиция и вариант 0-3, очки 0-1000, время не отрицательное.
ALTER TABLE "answers" ADD CONSTRAINT "answers_shape_check" CHECK (
    "question_index" BETWEEN 0 AND 9
    AND "option_index" BETWEEN 0 AND 3
    AND "position" BETWEEN 0 AND 3
    AND "points" BETWEEN 0 AND 1000
    AND "time_ms" >= 0
);
