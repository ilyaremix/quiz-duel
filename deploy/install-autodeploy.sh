#!/usr/bin/env bash
# Включает автодеплой: systemd-таймер раз в минуту запускает deploy/autodeploy.sh.
# Запуск на сервере один раз: bash /root/quiz-duel/deploy/install-autodeploy.sh
# Выключить: systemctl disable --now quiz-duel-deploy.timer

set -euo pipefail

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_dir"
chmod +x deploy/autodeploy.sh

cat >/etc/systemd/system/quiz-duel-deploy.service <<EOF
[Unit]
Description=Quiz Duel: выкатить новый коммит из GitHub
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
Environment=REPO_DIR=$repo_dir
ExecStart=$repo_dir/deploy/autodeploy.sh
# Сборка на слабом сервере может идти долго
TimeoutStartSec=30min
Nice=10
EOF

cat >/etc/systemd/system/quiz-duel-deploy.timer <<'EOF'
[Unit]
Description=Quiz Duel: проверять GitHub раз в минуту

[Timer]
OnActiveSec=10s
OnBootSec=2min
OnUnitInactiveSec=1min
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

# Уведомления о выкатке: если чат не задан, берём первого игрока из базы (это создатель).
if ! grep -qE '^DEPLOY_NOTIFY_CHAT_ID=.+' .env; then
  owner=$(docker compose exec -T postgres psql -U quizduel quizduel -tAc \
    'select id from users order by created_at limit 1' 2>/dev/null | tr -d '[:space:]' || true)
  if [[ -n "$owner" ]]; then
    sed -i '/^DEPLOY_NOTIFY_CHAT_ID=/d' .env
    printf '\n# Кому бот пишет об автодеплое (Telegram id)\nDEPLOY_NOTIFY_CHAT_ID=%s\n' "$owner" >>.env
    echo "Уведомления о выкатке пойдут в Telegram id $owner"
  else
    echo "Игроков в базе нет - уведомления выключены (DEPLOY_NOTIFY_CHAT_ID в .env)"
  fi
fi

systemctl daemon-reload
systemctl enable --now quiz-duel-deploy.timer
echo "Автодеплой включён. Журнал: journalctl -u quiz-duel-deploy -f"
systemctl list-timers quiz-duel-deploy.timer --no-pager
