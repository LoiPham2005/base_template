# Multi-stage build for apps/api, run from the MONOREPO ROOT:
#   docker build -f apps/api/Dockerfile -t base-template-api .
# Works as-is on Railway (it reads a Dockerfile directly) and on any
# plain Docker host. Uses `turbo prune` so the final image only carries
# what apps/api actually depends on (packages/core, db, contracts).

FROM node:22-alpine AS base
# libssl: Prisma's query engine needs it on Alpine, otherwise it fails
# at runtime with "Unable to require libquery_engine".
RUN apk add --no-cache libc6-compat openssl
# Phiên bản pnpm đọc từ trường `packageManager` trong package.json, không ghi
# cứng ở đây — ghi cứng là sớm muộn cũng lệch với máy dev và với CI.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN corepack pnpm dlx turbo@2 prune api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
# turbo prune's json-only layer omits non-package.json files, but
# packages/db's postinstall runs `prisma generate`, which needs the
# actual schema — copy it in before `pnpm install` runs postinstall.
COPY --from=pruner /app/out/full/packages/db/prisma ./packages/db/prisma
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm exec turbo run build --filter=api...

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3001
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S -G nodejs nestjs
COPY --from=installer --chown=nestjs:nodejs /app .
# Không chạy bằng root: một lỗ RCE trong app không kéo theo quyền root container.
USER nestjs
WORKDIR /app/apps/api
EXPOSE 3001

# Container còn sống nhưng mất kết nối database thì vẫn phải bị xoay vòng —
# /health có truy vấn DB thật, không chỉ kiểm tra "tiến trình còn chạy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
