#!/bin/sh
set -e
# Veritabanı şemasını güncelle (yalnızca ileri yönlü, veri silmez)
node /app/node_modules/prisma/build/index.js migrate deploy --schema /app/api/prisma/schema.prisma
exec node /app/api/dist/index.js
