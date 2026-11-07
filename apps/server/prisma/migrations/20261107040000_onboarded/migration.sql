-- Этап 9: смотрел ли игрок слайды онбординга. Пришедший по ссылке принимает документы
-- в шторке перед лобби, а онбординг видит после партии (ТЗ, экран 2).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "onboarded" BOOLEAN NOT NULL DEFAULT false;

-- Кто уже принял документы до этого этапа, онбординг заново не увидит.
UPDATE "users" SET "onboarded" = true WHERE "docs_version" IS NOT NULL;
