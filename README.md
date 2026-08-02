# base_template

Khung dùng chung cho mọi dự án. Có 3 cách dùng repo này tuỳ quy mô —
đọc mục "Chọn cấu hình theo quy mô dự án" bên dưới trước khi bắt đầu,
đừng mặc định dùng cả `apps/web` + `apps/api` nếu dự án không cần.

```
apps/
  web/            Next.js 15 (App Router) — BFF mỏng, KHÔNG chứa business logic
  api/            NestJS — chứa toàn bộ business logic + REST cho web/mobile/3rd-party
packages/
  core/           Business logic thuần (không phụ thuộc framework), CHỈ apps/api dùng
  db/             Prisma schema + client — CHỈ packages/core được import
  contracts/      Zod schema dùng chung (form web, DTO api, type core)
  config/         eslint + tsconfig dùng chung
```

## Chọn cấu hình theo quy mô dự án

Đừng chạy cả `apps/web` + `apps/api` nếu dự án không cần — đó là
over-engineering. 3 cấu hình hợp lệ:

### 1. Chỉ cần API (mobile/đối tác gọi, không có web trong repo này)

Xoá `apps/web`. `apps/api` tự đứng độc lập với `packages/core|db|contracts`,
không cần sửa gì thêm.

### 2. Web đơn lẻ, CHẮC CHẮN không bao giờ cần app khác gọi vào (blog, landing
page, tool nội bộ 1 người dùng)

Đây là trường hợp Next.js + Prisma cổ điển — không cần NestJS. Xoá
`apps/api`, rồi cho `apps/web` gọi thẳng `packages/core` trong cùng
process (nhanh hơn, ít 1 service phải chạy/deploy):

```bash
# 1. Xoá apps/api (không cần nữa)
rm -rf apps/api

# 2. apps/web/package.json — thêm lại 2 dependency
#    "@repo/core": "workspace:*"
#    "@repo/db": "workspace:*"

# 3. apps/web/next.config.mjs — transpilePackages thêm "@repo/core"

# 4. apps/web/eslint.config.js — đổi base.webMustUseApi thành
#    base.noDirectDbImport (chỉ chặn @repo/db, KHÔNG chặn @repo/core
#    nữa, vì giờ web chính là nơi gọi core)

# 5. apps/web/.env — đổi API_URL thành DATABASE_URL

# 6. Xoá apps/web/lib/api.ts (không cần nữa, tránh để lại code chết)
rm -f apps/web/lib/api.ts
```

Trong Server Component/Server Action, thay `apiFetch("/users")` bằng
gọi thẳng `core.user.list()` / `core.user.create(...)` (import từ
`@repo/core`). Cấu hình này đã được build, typecheck, test, lint, và
chạy `next start` thật (server log xác nhận gọi thẳng
`prisma.user.findMany()` trong process, không qua HTTP) — không phải
hướng dẫn suông, đã kiểm chứng lại từng bước một trong một bản copy
riêng trước khi ghi vào đây.

**Đừng chọn nhánh này chỉ vì muốn nhanh gọn lúc đầu rồi hy vọng thêm
mobile sau** — nếu có bất kỳ khả năng nào cần app/client thứ 2 trong
tương lai gần, dùng cấu hình 3 ngay từ đầu để đỡ phải chuyển đổi.

### 3. Web + API (+ mobile sau này) — mặc định của repo này

Không cần sửa gì — đây là cấu hình đang có sẵn, dùng khi dự án có (hoặc
sẽ sớm có) hơn 1 client: web, mobile, đối tác thứ 3.

## Vì sao web KHÔNG gọi thẳng Prisma/core (cấu hình mặc định, mục 3)

```
Web (Next.js)  ──HTTP──▶  API (NestJS)  ──▶  packages/core ──▶ Prisma ──▶ DB
Mobile         ──HTTP──▶ ↗ (CÙNG API, CÙNG endpoint, CÙNG validation)
```

`apps/web` chỉ là BFF: Server Component/Server Action gọi `apiFetch()`
trong `lib/api.ts`, y hệt cách mobile gọi REST. Đổi lại 1 nhịp gọi mạng
nội bộ mỗi request, đây là kiến trúc đã chạy ổn định và nhất quán trên
mọi dự án thật (web/api/mobile luôn cùng một nguồn sự thật cho business
rule, không có đường tắt nào bị bỏ sót khi thêm client mới).

`packages/core` vẫn tồn tại như lớp business logic thuần — nhưng giờ
chỉ `apps/api` import nó. Nếu sau này bạn có second API service hoặc
worker chạy cron/queue, chúng cũng import `packages/core` y như
`apps/api`, không phải viết lại.

## Yêu cầu

- Node >= 20
- pnpm >= 9 (`corepack enable` nếu chưa có)
- PostgreSQL (đổi provider trong `packages/db/prisma/schema.prisma` nếu muốn DB khác)

## Cài đặt lần đầu

```bash
pnpm install

cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# sửa DATABASE_URL trong packages/db/.env và apps/api/.env cho đúng Postgres của bạn
# apps/web/.env chỉ cần API_URL trỏ vào apps/api (mặc định http://localhost:3001)

pnpm db:migrate     # tạo bảng theo schema.prisma
pnpm db:generate    # sinh Prisma Client
```

## Chạy dev

```bash
pnpm dev            # build packages 1 lần rồi chạy song song web + api
pnpm dev:web        # chỉ web  → http://localhost:3000
pnpm dev:api        # chỉ api  → http://localhost:3001 (Swagger tại /docs)
```

`apps/web` cần `apps/api` đang chạy để có dữ liệu — chạy `pnpm dev`
(cả hai cùng lúc), không chỉ `pnpm dev:web`.

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
4. Thêm `OrderController` + `OrderModule` trong `apps/api/src/order/`, copy
   đúng khuôn của `user/` — bind `{ provide: OrderService, useValue: core.order }`.
5. Web: gọi `apiFetch<Order[]>("/orders")` trong Server Component/Server Action
   (xem `apps/web/app/users/page.tsx` làm mẫu). Mobile gọi cùng endpoint đó.

Business logic chỉ viết một lần trong `packages/core`; web và mobile
không bao giờ có bản sao thứ hai của validation/business rule.

## Nguyên tắc kiến trúc (ESLint enforce sẵn)

- `apps/api` không được import `@repo/db` trực tiếp — phải qua `@repo/core`.
- `apps/web` không được import `@repo/core` lẫn `@repo/db` — phải qua
  `lib/api.ts` gọi HTTP sang `apps/api`.

Nếu ESLint báo `no-restricted-imports` ở 2 chỗ trên, nghĩa là logic
đang bị đặt sai lớp.

## Những lỗi cần tránh khi mở rộng base này

Rút ra từ việc so sánh với các dự án thật đã có:

- **Đừng để 2 thư viện validate cùng tồn tại** (vd Zod + class-validator +
  Joi trộn lẫn). Dùng đúng 1 chuẩn: Zod trong `packages/contracts`, cả
  `nestjs-zod` (api) và `react-hook-form` (web) đều đọc từ đó.
- **Đừng để lại cấu hình ORM/thư viện cũ chưa xoá** (vd cấu hình TypeORM
  song song với Prisma dù không dùng) — code chết gây hiểu lầm cho người
  sau. Xoá hẳn khi migrate, đừng "để đó phòng khi cần".
- **Đừng commit mock data cạnh API thật** (vd `src/mocks/` trùng tên với
  `lib/*.ts` thật) — dễ import nhầm. Nếu cần mock, đặt trong `__mocks__/`
  hoặc file test, không đặt cạnh code chạy production.
- **Đừng cài test runner rồi không viết test** — nếu có `vitest`/`jest`
  trong `package.json`, phải có ít nhất test cho `packages/core` (xem
  `packages/core/src/user/user.service.test.ts` làm mẫu: mock Prisma,
  không cần DB thật, chạy trong vài giây).
- **Token/session**: ưu tiên httpOnly cookie set từ `apps/web` (BFF) hơn
  lưu JWT thẳng vào `localStorage` ở client — tránh lộ token qua XSS.
- **Không commit script debug rác** (`tmp-check-*.ts`, `check_db.ts`...)
  vào cùng thư mục code — dọn hoặc để trong `scripts/` có `.gitignore`.

## Test

```bash
pnpm test           # chạy vitest trong packages/core (mock Prisma, không cần DB thật)
```

## Build & deploy

```bash
pnpm build          # build cả web (apps/web/.next) và api (apps/api/dist)
```

- `apps/web` → deploy Vercel (hoặc `next start` sau build). Chỉ cần biết
  `API_URL` của `apps/api`, không cần biết `DATABASE_URL`.
- `apps/api` → build Docker image chạy `node dist/main.js`, deploy
  Railway/Fly/VPS. Đây là nơi duy nhất giữ `DATABASE_URL`.
- Mobile (Flutter/React Native) trỏ thẳng vào `apps/api`, dùng Swagger
  doc tại `/docs` để sinh client hoặc tham chiếu contract.
