-- CreateEnum
CREATE TYPE "Category" AS ENUM ('science', 'history', 'culture', 'sport', 'tech');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "text_ru" TEXT NOT NULL,
    "text_en" TEXT NOT NULL,
    "options_ru" TEXT[],
    "options_en" TEXT[],
    "correct_index" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_category_difficulty_idx" ON "questions"("category", "difficulty");


-- Ручная проверка целостности (Prisma не описывает CHECK в схеме, но и не трогает их):
-- ровно 4 варианта на каждом языке и верный индекс 0-3.
ALTER TABLE "questions" ADD CONSTRAINT "questions_shape_check" CHECK (
    cardinality("options_ru") = 4
    AND cardinality("options_en") = 4
    AND "correct_index" BETWEEN 0 AND 3
);
