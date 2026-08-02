# Multi-stage build for apps/api, run from the MONOREPO ROOT:
#   docker build -f apps/api/Dockerfile -t base-template-api .
# Works as-is on Railway (it reads a Dockerfile directly) and on any
# plain Docker host. Uses `turbo prune` so the final image only carries
# what apps/api actually depends on (packages/core, db, contracts).

FROM node:20-alpine AS base
# libssl: Prisma's query engine needs it on Alpine, otherwise it fails
# at runtime with "Unable to require libquery_engine".
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm@9.15.0 turbo@2.10.8

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune api --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
# turbo prune's json-only layer omits non-package.json files, but
# packages/db's postinstall runs `prisma generate`, which needs the
# actual schema — copy it in before `pnpm install` runs postinstall.
COPY --from=pruner /app/out/full/packages/db/prisma ./packages/db/prisma
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=api...

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs
COPY --from=installer --chown=nestjs:nodejs /app .
USER nestjs
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
