#!/bin/sh
# Резервные копии базы (сервис backup в docker-compose.yml, образ postgres:17-alpine).
#
# Раз в сутки в BACKUP_AT_UTC (по умолчанию 01:00 UTC = 04:00 по Москве, ночью игроков меньше всего)
# pg_dump пишет копию в /backups (на сервере - папка backups рядом с docker-compose.yml).
# Копии старше BACKUP_KEEP_DAYS (по умолчанию 14) удаляются. При старте контейнера (выкатка,
# перезагрузка сервера) копия делается сразу, если последней больше суток.
# Файл пишется под временным именем и переименовывается только целиком: недописанная копия
# не выглядит готовой. Время последней удачной копии - в /backups/.last-ok, его показывает /api/health.
# Восстановление - docs/DEPLOY.md, раздел «Резервные копии базы».
set -eu

dir=/backups
keep="${BACKUP_KEEP_DAYS:-14}"
at="${BACKUP_AT_UTC:-01:00}"
stamp="$dir/.last-ok"

backup() {
  name="quizduel-$(date -u +%Y-%m-%d-%H%M).dump"
  tmp="$dir/.$name.part"
  # Копия - это вся база (имена и id игроков): читать её может только root сервера.
  if (umask 077 && pg_dump --format=custom --compress=6 --no-owner --file="$tmp"); then
    mv "$tmp" "$dir/$name"
    date -u +%s >"$stamp.part" && chmod 644 "$stamp.part" && mv "$stamp.part" "$stamp"
    echo "$(date -u '+%F %T') копия готова: $name, $(du -h "$dir/$name" | cut -f1)"
  else
    rm -f "$tmp"
    echo "$(date -u '+%F %T') ОШИБКА: копия не сделана" >&2
  fi
  find "$dir" -maxdepth 1 -name 'quizduel-*.dump' -mtime "+$keep" -print -delete | sed 's/^/удалена старая копия: /'
}

# Секунды до ближайшего BACKUP_AT_UTC (часы и минуты - без ведущих нулей, «08» иначе не число).
until_next() {
  now=$(date -u +%s)
  h=$(echo "$at" | cut -d: -f1 | sed 's/^0*//')
  m=$(echo "$at" | cut -d: -f2 | sed 's/^0*//')
  next=$((now - now % 86400 + ${h:-0} * 3600 + ${m:-0} * 60))
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  echo $((next - now))
}

# docker stop: выходим сразу, а не через 10 с ожидания.
trap 'exit 0' TERM INT

mkdir -p "$dir"
until pg_isready -q; do sleep 2; done

last=$(cat "$stamp" 2>/dev/null || echo 0)
if [ $(($(date -u +%s) - last)) -gt 86400 ]; then backup; fi

while true; do
  sleep "$(until_next)" &
  wait $!
  backup
done
