-- Обновление 2.0: монеты и магазин, оплата звёздами, реклама, темы на 1 игру, друзья,
-- настраиваемые задания, события и дни активности для админки, тема оформления.

-- CreateEnum
CREATE TYPE "ThemeSetting" AS ENUM ('auto', 'light', 'dark');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ad_free" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "games_since_ad" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "glow" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "reaction_pack" TEXT NOT NULL DEFAULT 'base',
ADD COLUMN     "ref_rewarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referrer_id" BIGINT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "streak_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streak_day" TEXT,
ADD COLUMN     "theme" "ThemeSetting" NOT NULL DEFAULT 'auto';

-- CreateTable
CREATE TABLE "coin_ledger" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref" TEXT,
    "key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "user_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("user_id","kind","item")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" VARCHAR(32) NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT,
    "goal" INTEGER NOT NULL DEFAULT 1,
    "reward" INTEGER NOT NULL,
    "freq" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_progress" (
    "user_id" BIGINT NOT NULL,
    "task_id" VARCHAR(32) NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_progress_pkey" PRIMARY KEY ("user_id","task_id","day")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "product" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_views" (
    "id" VARCHAR(32) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "purpose" TEXT NOT NULL,
    "topic" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "ad_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_passes" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "topic" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),
    "game_id" VARCHAR(10),

    CONSTRAINT "topic_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friends" (
    "user_id" BIGINT NOT NULL,
    "friend_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "via" TEXT NOT NULL DEFAULT 'request',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("user_id","friend_id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "name" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_days" (
    "user_id" BIGINT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "user_days_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "links" (
    "code" VARCHAR(32) NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "links_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_ledger_key_key" ON "coin_ledger"("key");

-- CreateIndex
CREATE INDEX "coin_ledger_user_id_created_at_idx" ON "coin_ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "coin_ledger_reason_created_at_idx" ON "coin_ledger"("reason", "created_at");

-- CreateIndex
CREATE INDEX "inventory_kind_item_idx" ON "inventory"("kind", "item");

-- CreateIndex
CREATE INDEX "task_progress_task_id_claimed_at_idx" ON "task_progress"("task_id", "claimed_at");

-- CreateIndex
CREATE INDEX "purchases_user_id_idx" ON "purchases"("user_id");

-- CreateIndex
CREATE INDEX "purchases_created_at_idx" ON "purchases"("created_at");

-- CreateIndex
CREATE INDEX "ad_views_user_id_started_at_idx" ON "ad_views"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "ad_views_started_at_idx" ON "ad_views"("started_at");

-- CreateIndex
CREATE INDEX "topic_passes_user_id_topic_used_at_idx" ON "topic_passes"("user_id", "topic", "used_at");

-- CreateIndex
CREATE INDEX "friends_friend_id_status_idx" ON "friends"("friend_id", "status");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- CreateIndex
CREATE INDEX "events_name_created_at_idx" ON "events"("name", "created_at");

-- CreateIndex
CREATE INDEX "user_days_day_idx" ON "user_days"("day");

-- CreateIndex
CREATE INDEX "users_referrer_id_idx" ON "users"("referrer_id");

-- AddForeignKey
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_views" ADD CONSTRAINT "ad_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_passes" ADD CONSTRAINT "topic_passes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_days" ADD CONSTRAINT "user_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
