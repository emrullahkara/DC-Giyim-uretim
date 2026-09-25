#!/bin/sh
# Yedekten geri yükler. DİKKAT: mevcut verinin üzerine yazar.
#   ./scripts/geri-yukle.sh yedekler/dcgiyim-20260101-0330.sql.gz
set -e
[ -f "$1" ] || { echo "Kullanım: $0 <yedek-dosyasi.sql.gz>"; exit 1; }
printf "Mevcut veritabanı SİLİNİP yedek yüklenecek. Devam için EVET yazın: "
read ans
[ "$ans" = "EVET" ] || { echo "İptal edildi."; exit 1; }
docker compose stop app
docker compose exec -T db psql -U dcgiyim -d postgres -c "DROP DATABASE IF EXISTS dcgiyim;" -c "CREATE DATABASE dcgiyim OWNER dcgiyim;"
gunzip -c "$1" | docker compose exec -T db psql -U dcgiyim -d dcgiyim
docker compose start app
echo "Geri yükleme tamamlandı."
