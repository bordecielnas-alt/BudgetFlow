# syntax=docker/dockerfile:1.7

# --- Build ---
FROM oven/bun:1.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Cible Node autonome (serveur HTTP qui écoute sur $PORT), pas Cloudflare.
ENV NITRO_PRESET=node-server
RUN bun run build \
 && test -f .output/server/index.mjs

# --- Runtime ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
COPY --from=build /app/.output ./.output
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN apk add --no-cache su-exec \
 && chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /data && chown -R node:node /data
# On démarre en root pour pouvoir corriger les droits du volume monté,
# puis l'entrypoint abandonne les privilèges vers l'utilisateur `node`.
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
