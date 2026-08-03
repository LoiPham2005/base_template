# Multi-stage build for apps/web, run from the MONOREPO ROOT:
#   docker build -f apps/web/Dockerfile -t base-template-web .

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
# Phiên bản pnpm đọc từ trường `packageManager` trong package.json, không ghi
# cứng ở đây — ghi cứng là sớm muộn cũng lệch với máy dev và với CI.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN corepack pnpm dlx turbo@2 prune web --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec turbo run build --filter=web...

# ---------------------------------------------------------------------------
# runner — chỉ mang theo output standalone.
#
# Bản trước dùng `COPY --from=installer /app ./`, tức là chép NGUYÊN monorepo
# gồm node_modules của mọi workspace, mã nguồn, và cả devDependencies — vì
# `next start` cần đủ chừng đó. Với `output: "standalone"` (xem next.config.mjs),
# Next đã trace sẵn đúng những file cần thiết vào .next/standalone.
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # server.js của standalone mặc định bind vào localhost; trong container
    # điều đó nghĩa là không nhận được request nào từ bên ngoài.
    HOSTNAME=0.0.0.0

# Cú pháp busybox của Alpine, không phải groupadd/useradd của Debian.
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S -G nodejs nextjs

# standalone giữ nguyên cấu trúc monorepo bên trong, nên server.js nằm ở
# apps/web/server.js chứ không phải gốc.
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Không chạy bằng root: một lỗ RCE trong app không kéo theo quyền root container.
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
