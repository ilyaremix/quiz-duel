# Сборка из корня репозитория: docker compose build web

# 1. Сборка мини-аппа (Vite)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci -w @quiz-duel/web --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @quiz-duel/web

# 2. Caddy отдаёт статику и проксирует /api и /socket.io на server.
# Не от root: свой пользователь без прав (данные Caddy - в /data и /config), порт 8080.
FROM caddy:2-alpine
RUN addgroup -S -g 10001 web && adduser -S -D -H -u 10001 -G web web && chown -R web:web /data /config
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
USER web
EXPOSE 8080
