# Build từ GỐC monorepo:
#   docker build -f apps/worker/Dockerfile -t base-template-worker .
#
# Cùng khuôn với apps/api — xem ghi chú chi tiết trong apps/api/Dockerfile.

FROM node:22-alpine AS base
# libssl: query engine của Prisma cần nó trên Alpine, thiếu là lỗi lúc chạy với
# "Unable to require libquery_engine".
RUN apk add --no-cache libc6-compat openssl
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN corepack pnpm dlx turbo@2 prune worker --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
# `turbo prune` ở lớp json chỉ giữ package.json, nhưng postinstall của
# packages/db chạy `prisma generate` và cần schema thật.
COPY --from=pruner /app/out/full/packages/db/prisma ./packages/db/prisma
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm exec turbo run build --filter=worker...

FROM base AS runner
ENV NODE_ENV=production \
    WORKER_HEALTH_PORT=3002
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S -G nodejs worker
COPY --from=installer --chown=worker:nodejs /app .
USER worker
WORKDIR /app/apps/worker
EXPOSE 3002

# Worker không phục vụ request nghiệp vụ nên "tiến trình còn chạy" không nói
# lên điều gì — /health đếm job thật, và trả 503 khi mất kết nối Redis.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# SIGTERM cần thời gian để job đang chạy hoàn tất — xem `stop_grace_period`
# trong docker-compose.yml.
CMD ["node", "dist/main.js"]
