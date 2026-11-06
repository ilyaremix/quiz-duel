# Деплой на сервер (Hetzner, Ubuntu 24.04)

Схема: Caddy на сервере (HTTPS) → контейнер `web` на `127.0.0.1:3080` (статика, прокси `/api` и `/socket.io`)
→ контейнер `server` (API, сокет, бот) → контейнер `postgres`. Домен: `quiz.aidcrypto.blog` (A-запись на IP сервера в Porkbun).

## 1. Бот в @BotFather

1. `/newbot` → имя `Quiz Duel` → username, например `quizduel_xxx_bot` → сохранить токен.
2. Узнать домен (команды на сервере, шаг 2) - он нужен для мини-аппа.
3. `/newapp` → выбрать бота → название `Quiz Duel` → описание → картинка 640×360
   (`docs/botfather-cover.png`) → GIF: `/empty` → URL: `https://<домен>` → short name: `play`.
   Ссылка на мини-апп: `https://t.me/<username бота>/play`.

## 2. Сервер

```bash
ssh root@<IP>

# Docker (если ещё нет)
docker --version || curl -fsSL https://get.docker.com | sh
docker compose version

# Кто держит 80/443 (должен быть caddy) и свободен ли 3080
ss -ltnp | grep -E ':(80|443|3080)\s'

# Домен (A-запись quiz → IP сервера; без своего домена подойдёт quiz.<ip-через-дефисы>.sslip.io)
DOMAIN=quiz.aidcrypto.blog
```

## 3. Код и настройки

```bash
cd /root
git clone https://github.com/ilyaremix/quiz-duel.git
cd quiz-duel
cp .env.example .env
sed -i "s|^WEB_APP_URL=.*|WEB_APP_URL=https://$DOMAIN|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
nano .env          # BOT_TOKEN и APP_SHORT_NAME=play
chmod 600 .env

docker compose up -d --build
docker compose ps                         # postgres и server - healthy, web - Up
curl -s http://127.0.0.1:3080/api/health  # {"ok":true,"db":true,...}
```

## 4. HTTPS через Caddy

```bash
cat >> /etc/caddy/Caddyfile <<EOF

$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3080
}
EOF
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
curl -s https://$DOMAIN/api/health
```

## Обновление после нового коммита

```bash
cd /root/quiz-duel && git pull && docker compose up -d --build
```

## Полезное

```bash
docker compose logs -f server                 # логи сервера и бота
docker compose restart server
docker compose exec postgres psql -U quizduel quizduel -c 'select id, first_name, rating from users;'
```

Данные базы лежат в docker-томе `quiz-duel_pgdata` и переживают пересборку.
`docker compose down -v` удаляет их вместе с томом.
