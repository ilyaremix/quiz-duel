# Quiz Duel

Telegram Mini App: викторина 1 на 1 в реальном времени. Тестовое задание на позицию вайб-кодера.

> Работа идёт по этапам, у каждого этапа - свой коммит. Полный README с GIF, схемами
> и таблицей крайних случаев появится на последнем этапе.

## Статус

| Этап | Что | Статус |
|---|---|---|
| 0 | Дизайн: кликабельный прототип 24 экранов | ✅ |
| 1 | Каркас: монорепо, бот, проверка initData, Postgres, Docker + Caddy | ✅ |
| 2 | 100 вопросов RU/EN | ⏳ |
| 3 | Движок: машина состояний, очки, Эло, ачивки | ⏳ |
| 4 | Лобби и приглашение по ссылке | ⏳ |
| 5 | Партия | ⏳ |
| 6 | Надёжность: переподключение, техническая победа | ⏳ |
| 7 | Реванш, рейтинг, статистика | ⏳ |
| 8 | Доп. фичи | ⏳ |
| 9 | Полировка | ⏳ |
| 10 | Сдача | ⏳ |

## Стек

TypeScript везде. Мини-апп: React 19 + Vite, Tailwind, i18next, `@tma.js/sdk-react`
(преемник `@telegram-apps/sdk-react`). Сервер: Node 22, Fastify, Socket.IO, grammY,
PostgreSQL + Prisma 7. Тесты: Vitest. Деплой: Docker Compose + Caddy.

```
apps/web/          мини-апп (React)
apps/server/       Fastify + Socket.IO + бот
  src/auth/        проверка initData
  src/bot/         бот
  prisma/          схема и миграции
packages/shared/   общие типы API и событий, выбор языка
deploy/            блок Caddyfile для сервера
docs/DEPLOY.md     пошаговый деплой
```

## Безопасность (что уже сделано)

- **initData проверяется на каждом REST-запросе и при подключении сокета**: HMAC-SHA256
  с ключом из токена бота, сравнение за постоянное время, `auth_date` не старше 24 часов,
  повторяющиеся ключи и дописанные поля отклоняются. `userId` берётся только из проверенных данных.
- initData передаётся в заголовке `Authorization: tma …` и вырезается из логов.
- CORS - только домен мини-аппа. Лимит запросов - на игрока (до входа - на IP).
- Реальный IP игрока: доверяем `X-Forwarded-For` только от Caddy внутри docker-сети.
- Наружу открыт только Caddy; сервер и база доступны лишь внутри docker-сети.

## Запуск

### Одной командой (как на сервере)

```bash
cp .env.example .env     # заполнить BOT_TOKEN, APP_SHORT_NAME, WEB_APP_URL, POSTGRES_PASSWORD
docker compose up -d --build
curl http://127.0.0.1:3080/api/health
```

Вне Telegram на http://127.0.0.1:3080 видна заглушка «Откройте в Telegram».
Чтобы открыть внутри Telegram локально, нужен HTTPS-туннель (например, `cloudflared tunnel --url http://127.0.0.1:3080`)
и его адрес в `WEB_APP_URL` и в настройках мини-аппа тестового бота.

### Разработка с горячей перезагрузкой

```bash
npm ci
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
# в .env раскомментировать DATABASE_URL
npm run db:migrate
npm run dev:server   # API на :3000
npm run dev:web      # мини-апп на :5173, /api и /socket.io проксируются на :3000
```

### Проверки

```bash
npm run db:generate   # клиент Prisma (нужен для проверки типов)
npm run typecheck
npm test
npm run build
```

Деплой на сервер - [docs/DEPLOY.md](docs/DEPLOY.md).

## Лицензия

MIT
