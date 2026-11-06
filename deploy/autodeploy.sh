#!/usr/bin/env bash
# Автодеплой Quiz Duel. Запускается systemd-таймером раз в минуту (deploy/install-autodeploy.sh).
#
# 1. git fetch: есть ли в origin/main новый коммит.
# 2. Ждёт, пока CI на GitHub для этого коммита станет зелёным (красный - не выкатываем).
# 3. git reset на новый коммит, docker compose up -d --build, проверка /api/health.
# 4. Пишет итог в журнал (journalctl -u quiz-duel-deploy) и, если задан
#    DEPLOY_NOTIFY_CHAT_ID в .env, присылает сообщение от бота.
#
# Весь код внутри main(): bash читает функцию целиком до запуска, поэтому
# git reset, который меняет этот самый файл, не ломает текущий прогон.

set -uo pipefail

main() {
  local repo_dir="${REPO_DIR:-/root/quiz-duel}"
  local branch="${BRANCH:-main}"
  local gh_repo="${GH_REPO:-ilyaremix/quiz-duel}"
  local state_dir="${STATE_DIR:-/var/lib/quiz-duel-deploy}"
  local build_log="${BUILD_LOG:-/var/log/quiz-duel-build.log}"

  cd "$repo_dir" || { echo "нет папки $repo_dir"; exit 1; }
  mkdir -p "$state_dir"

  # Одна сборка за раз: если прошлая ещё идёт, тихо выходим.
  exec 9>"$state_dir/lock"
  flock -n 9 || exit 0

  git fetch -q origin "$branch" 2>/dev/null || { echo "git fetch не удался, попробую через минуту"; exit 0; }

  local current target short subject
  current=$(git rev-parse HEAD)
  target=$(git rev-parse "origin/$branch")
  [[ "$current" == "$target" ]] && exit 0

  short=${target:0:7}
  subject=$(git log -1 --format=%s "$target")

  # Коммит с красным CI уже отбракован - ждём следующий.
  grep -qx "$target" "$state_dir/rejected" 2>/dev/null && exit 0

  if [[ "${REQUIRE_CI:-true}" == "true" ]]; then
    local ci
    ci=$(ci_status "$gh_repo" "$target")
    case "$ci" in
      success) ;;
      failure)
        echo "$target" >>"$state_dir/rejected"
        say "CI красный для $short ($subject) - не выкатываю"
        notify "❌ Quiz Duel: CI красный, $short не выкачен
$subject"
        exit 0
        ;;
      *)
        # Ещё идёт (или GitHub не ответил). Пишем в журнал один раз, а не каждую минуту.
        if [[ "$(cat "$state_dir/waiting" 2>/dev/null)" != "$target" ]]; then
          echo "$target" >"$state_dir/waiting"
          say "жду CI для $short ($subject)"
        fi
        exit 0
        ;;
    esac
  fi

  say "выкатываю ${current:0:7} → $short ($subject)"
  local started=$SECONDS
  # На сервере код не правят руками, поэтому просто встаём на коммит из GitHub.
  # .env в .gitignore, его reset не трогает.
  git reset -q --hard "$target"

  if docker compose up -d --build --remove-orphans >"$build_log" 2>&1 && wait_healthy; then
    local took=$((SECONDS - started))
    say "готово: $short за ${took} с"
    notify "✅ Quiz Duel обновлён: $short за ${took} с
$subject"
    docker image prune -f >/dev/null 2>&1
  else
    say "ОШИБКА выкатки $short, лог сборки: $build_log"
    tail -n 30 "$build_log"
    notify "⚠️ Quiz Duel: не удалось выкатить $short
$subject
Лог: $build_log"
  fi
}

say() { echo "$*"; }

# success | failure | pending - по запускам GitHub Actions для коммита.
# Репозиторий публичный, токен не нужен; запрос идёт только при новом коммите.
ci_status() {
  curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$1/actions/runs?head_sha=$2&per_page=20" 2>/dev/null |
    python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin)["workflow_runs"]
except Exception:
    print("pending"); sys.exit()
if not runs or any(r["status"] != "completed" for r in runs):
    print("pending")
elif all(r["conclusion"] in ("success", "skipped") for r in runs):
    print("success")
else:
    print("failure")
' 2>/dev/null || echo pending
}

# Значение из .env без source: в паролях бывают символы, которые bash поймёт по-своему.
env_value() {
  grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

wait_healthy() {
  local port
  port=$(env_value WEB_PORT)
  for _ in $(seq 1 45); do
    curl -fsS --max-time 3 "http://127.0.0.1:${port:-3080}/api/health" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

notify() {
  local chat token
  chat=$(env_value DEPLOY_NOTIFY_CHAT_ID)
  token=$(env_value BOT_TOKEN)
  [[ -n "$chat" && -n "$token" ]] || return 0
  curl -fsS --max-time 10 -o /dev/null "https://api.telegram.org/bot$token/sendMessage" \
    --data-urlencode "chat_id=$chat" --data-urlencode "text=$1" 2>/dev/null || true
}

main "$@"
exit
