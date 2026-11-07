-- Обновление 2.0: напоминание о ежедневной награде (бот пишет не чаще раза в день)
ALTER TABLE "users" ADD COLUMN "remind_day" TEXT;
