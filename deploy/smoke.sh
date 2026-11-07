#!/usr/bin/env bash
# Проверка запущенного docker compose (её делает CI на чистой машине - как первая выкатка):
# API отвечает через Caddy и видит базу; сделана резервная копия базы; Caddy работает не от root;
# страница приходит с заголовками безопасности и без кэша, файлы сборки - с вечным кэшем,
# отсутствующий файл сборки - 404, ролики - кэш на сутки.
# Запуск: deploy/smoke.sh [адрес] [контейнер web], по умолчанию http://127.0.0.1:3080 quiz-duel-web-1
# SMOKE_BACKUP=false - без проверки копий (стенд без сервиса backup).
set -euo pipefail

base="${1:-http://127.0.0.1:3080}"
container="${2:-quiz-duel-web-1}"
failed=0

ok() { echo "ok   $1"; }
bad() {
  echo "FAIL $1"
  failed=1
}
# check "что проверяем" "текст ответа" "регулярное выражение"
check() {
  if grep -qiE "$3" <<<"$2"; then ok "$1"; else bad "$1"; fi
}

health=$(curl -fsS --retry 10 --retry-delay 2 --retry-all-errors "$base/api/health" || true)
check "API через Caddy: /api/health ok" "$health" '"ok":true'
check "API через Caddy: база на связи" "$health" '"db":true'

# Первая копия делается сразу при старте сервиса backup - ждём её до 30 с.
if [[ "${SMOKE_BACKUP:-true}" == "true" ]]; then
  for _ in $(seq 1 15); do
    health=$(curl -fsS "$base/api/health" || true)
    grep -qE '"backupAgoSec":[0-9]+' <<<"$health" && break
    sleep 2
  done
  check "резервная копия базы сделана (backupAgoSec)" "$health" '"backupAgoSec":[0-9]+'
fi

uid=$(docker exec "$container" stat -c %u /proc/1)
if [[ "$uid" != "0" ]]; then ok "Caddy работает не от root (uid $uid)"; else bad "Caddy работает от root"; fi

page=$(curl -fsS -D - -o /dev/null "$base/")
check "страница: 200" "$page" '^HTTP/[0-9.]+ 200'
check "страница: CSP, скрипты только свои" "$page" "^content-security-policy: .*script-src 'self';"
check "страница: CSP, во фрейме - только веб-Telegram" "$page" '^content-security-policy: .*frame-ancestors https://web\.telegram\.org'
check "страница: HSTS" "$page" '^strict-transport-security: max-age=[0-9]+'
check "страница: Permissions-Policy" "$page" '^permissions-policy: camera=\(\)'
check "страница: nosniff" "$page" '^x-content-type-options: nosniff'
check "страница: без кэша" "$page" '^cache-control: no-cache'
if grep -qi '^server:' <<<"$page"; then bad "страница: есть заголовок Server"; else ok "страница: нет заголовка Server"; fi

asset=$(curl -fsS "$base/" | grep -oE '/assets/[^"]+\.js' | head -n 1 || true)
if [[ -n "$asset" ]]; then
  js=$(curl -fsS -D - -o /dev/null "$base$asset")
  check "файл сборки: вечный кэш" "$js" '^cache-control: public, max-age=31536000, immutable'
  check "файл сборки: javascript" "$js" '^content-type: (text|application)/javascript'
else
  bad "в странице нет ссылки на /assets/*.js"
fi

missing=$(curl -sS -D - -o /dev/null "$base/assets/no-such-file-0000.js")
check "нет файла сборки: 404, а не страница" "$missing" '^HTTP/[0-9.]+ 404'

video=$(curl -fsS -D - -o /dev/null "$base/ads/ad1.mp4")
check "ролик рекламы: кэш на сутки" "$video" '^cache-control: public, max-age=86400'

route=$(curl -fsS -D - -o /dev/null "$base/some/app/route")
check "другой путь: страница приложения без кэша" "$route" '^cache-control: no-cache'

if [[ "$failed" != 0 ]]; then
  echo "Проверка не прошла"
  exit 1
fi
echo "Всё в порядке"
