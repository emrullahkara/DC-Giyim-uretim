#!/bin/sh
# Veritabanı yedeği alır: ./yedekler/dcgiyim-YYYYMMDD-HHMM.sql.gz
# Günlük otomatik yedek için crontab'a ekleyin:
#   30 3 * * * cd /opt/dc-giyim && ./scripts/yedekle.sh >> yedek.log 2>&1
set -e
mkdir -p yedekler
FILE="yedekler/dcgiyim-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U dcgiyim -d dcgiyim --no-owner | gzip > "$FILE"
chmod 600 "$FILE"
# 30 günden eski yedekleri sil
find yedekler -name 'dcgiyim-*.sql.gz' -mtime +30 -delete
echo "Yedek alındı: $FILE"
