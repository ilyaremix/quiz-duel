# Сборка из корня репозитория: docker compose build server
# (контекст - корень, потому что серверу нужен общий пакет packages/shared)

FROM node:22-bookworm-slim AS base
# openssl нужен движку миграций Prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 1. Зависимости: сначала только package.json - этот слой кэшируется, пока они не менялись
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci -w @quiz-duel/server --include-workspace-root

# 2. Сборка: клиент Prisma + один файл dist/index.js
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
# База вопросов встраивается в dist/index.js, в рабочий образ отдельно не копируется
COPY data data
RUN npm run prisma:generate -w @quiz-duel/server \
  && npm run build -w @quiz-duel/server

# 3. Рабочий образ: только продовые зависимости, сборка и миграции
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci -w @quiz-duel/server --omit=dev \
  && npm cache clean --force
COPY packages/shared packages/shared
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist

WORKDIR /app/apps/server
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Миграции применяются при каждом старте (уже применённые пропускаются), потом сервер
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
