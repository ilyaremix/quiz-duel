-- CreateEnum
CREATE TYPE "LangSetting" AS ENUM ('auto', 'ru', 'en');

-- CreateEnum
CREATE TYPE "MotionSetting" AS ENUM ('auto', 'on', 'off');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGINT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "username" TEXT,
    "photo_url" TEXT,
    "tg_language" TEXT,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "language" "LangSetting" NOT NULL DEFAULT 'auto',
    "reduced_motion" "MotionSetting" NOT NULL DEFAULT 'auto',
    "haptics" BOOLEAN NOT NULL DEFAULT true,
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "write_access" BOOLEAN NOT NULL DEFAULT false,
    "docs_version" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "games" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "total_correct" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_rating_idx" ON "users"("rating" DESC);
