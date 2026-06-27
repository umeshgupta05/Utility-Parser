FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @unstop-agent/api db:generate
RUN pnpm --filter @unstop-agent/web build
RUN pnpm --filter @unstop-agent/api build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL=file:/data/dev.db
ENV WEB_DIST_PATH=/app/apps/web/dist
ENV CORS_ORIGIN=true

RUN corepack enable
COPY --from=build /app ./
RUN mkdir -p /data

EXPOSE 4000
VOLUME ["/data"]

CMD ["sh", "-c", "node apps/api/dist/db/init.js && node apps/api/dist/server.js"]
