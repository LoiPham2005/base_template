# base_template

Khung dùng chung cho mọi dự án: web nhỏ chỉ cần `apps/web`; khi có mobile,
bật thêm `apps/api` mà không viết lại business logic.

```
apps/
  web/            Next.js 15 (App Router) — luôn có
  api/            NestJS — chỉ deploy khi có app mobile / bên thứ 3 cần REST
packages/
  core/           Business logic thuần (không phụ thuộc framework)
  db/             Prisma schema + client — CHỈ core được import
  contracts/      Zod schema dùng chung (form web, DTO api, type core)
  config/         eslint + tsconfig dùng chung
```

Nguyên tắc cốt lõi: `apps/web` gọi thẳng vào `packages/core` trong cùng
tiến trình (không qua HTTP) → web nhanh. `apps/api` bọc cùng service đó
để lộ REST cho mobile. Chỉ viết logic một lần trong `packages/core`.

## Yêu cầu

- Node >= 20
- pnpm >= 9 (`corepack enable` nếu chưa có)
- PostgreSQL (đổi provider trong `packages/db/prisma/schema.prisma` nếu muốn DB khác)

## Cài đặt lần đầu

```bash
pnpm install

cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
# sửa DATABASE_URL cho đúng Postgres của bạn trong cả 3 file trên

pnpm db:migrate     # tạo bảng theo schema.prisma
pnpm db:generate    # sinh Prisma Client
```

## Chạy dev

```bash
pnpm dev            # build packages 1 lần rồi chạy song song web + api
pnpm dev:web        # chỉ web  → http://localhost:3000
pnpm dev:api        # chỉ api  → http://localhost:3001 (Swagger tại /docs)
```

Nếu dự án không có mobile, chỉ cần `pnpm dev:web` — `apps/api` không
tốn tài nguyên, không cần deploy.

`packages/core|db|contracts` được biên dịch sang `dist/` (NestJS chạy
Node thật nên cần JS thật, không đọc trực tiếp `.ts` như Next.js).
`pnpm dev` tự build chúng một lần trước khi khởi động web/api. Nếu bạn
đang sửa liên tục trong `packages/core` và muốn tự động rebuild, mở
thêm 1 terminal chạy `pnpm --filter @repo/core dev` (tsc --watch).

## Thêm một domain mới (ví dụ "order")

1. Thêm model vào `packages/db/prisma/schema.prisma`, chạy `pnpm db:migrate`.
2. Thêm Zod schema vào `packages/contracts/src/order.ts`, export ở `index.ts`.
3. Viết `OrderService` thuần trong `packages/core/src/order/order.service.ts`,
   đăng ký instance trong `packages/core/src/container.ts`.
4. Web: gọi `core.order.xxx()` trực tiếp trong Server Component / Server Action.
5. Có mobile: thêm `OrderController` + `OrderModule` trong `apps/api/src/order/`,
   copy đúng khuôn của `user/` — bind `{ provide: OrderService, useValue: core.order }`.

Không có bước nào cần viết lại logic nghiệp vụ.

## Test

```bash
pnpm test           # chạy vitest trong packages/core (mock Prisma, không cần DB thật)
```

## Kiểm tra kiến trúc

`@repo/eslint-config` chặn `apps/web` và `apps/api` import `@repo/db`
trực tiếp — nếu ESLint báo lỗi `no-restricted-imports` ở đó, nghĩa là
logic đang bị viết sai chỗ, nên chuyển vào `packages/core`.

## Build & deploy

```bash
pnpm build          # build cả web (apps/web/.next) và api (apps/api/dist)
```

- `apps/web` → deploy Vercel (hoặc `next start` sau build).
- `apps/api` → build Docker image chạy `node dist/main.js`, deploy Railway/Fly/VPS.
- Cả hai đọc chung `DATABASE_URL` trỏ vào cùng một Postgres.
