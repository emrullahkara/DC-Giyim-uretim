# ── 1) Derleme aşaması
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w apps/api && npm run build -w apps/web
# Yalnızca çalışma zamanı bağımlılıkları
RUN npm prune --omit=dev && npx prisma generate --schema apps/api/prisma/schema.prisma

# ── 2) Çalışma aşaması (küçük, root olmayan kullanıcı)
FROM node:22-alpine AS run
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 WEB_DIST=/app/web
WORKDIR /app/api
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/api/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/web/dist /app/web
COPY --chown=node:node deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
