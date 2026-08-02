# base_template

Khung dùng chung cho mọi dự án. Có 3 cách dùng repo này tuỳ quy mô —
đọc mục "Chọn cấu hình theo quy mô dự án" bên dưới trước khi bắt đầu,
đừng mặc định dùng cả `apps/web` + `apps/api` nếu dự án không cần.

```
apps/
  web/            Next.js 16 (App Router, Turbopack) — BFF mỏng, KHÔNG chứa business logic
  api/            NestJS — chứa toàn bộ business logic + REST cho web/mobile/3rd-party
packages/
  core/           Business logic thuần (không phụ thuộc framework), CHỈ apps/api dùng
  db/             Prisma schema + client — CHỈ packages/core được import
  contracts/      Zod schema dùng chung (form web, DTO api, type core)
  config/         eslint + tsconfig dùng chung
```

## Chọn cấu hình theo quy mô dự án

Đừng chạy cả `apps/web` + `apps/api` nếu dự án không cần — đó là
over-engineering. Xem **[CONFIGURATIONS.md](./CONFIGURATIONS.md)** để
biết bảng quyết định và checklist xoá/sửa file cụ thể cho từng cấu
hình (Web+API mặc định / chỉ API / chỉ Next.js+Prisma).

## Vì sao web KHÔNG gọi thẳng Prisma/core (cấu hình mặc định)

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
- Mobile (Flutter/React Native) trỏ thẳng vào `apps/api`, dùng Swagger
  doc tại `/docs` để sinh client hoặc tham chiếu contract.

`apps/api` là nơi duy nhất giữ `DATABASE_URL`, deploy được bằng **cả 3
cách** dưới đây — chọn theo hạ tầng đang có, không cần chọn trước:

### A. Docker / Railway

```bash
docker build -f apps/api/Dockerfile -t my-api .
docker run -p 3001:3001 -e DATABASE_URL="..." my-api
```

`apps/api/Dockerfile` đã build+chạy thật để xác nhận (multi-stage,
dùng `turbo prune` nên image chỉ chứa đúng thứ `apps/api` cần —
`packages/core|db|contracts`, không kéo theo `apps/web`). Railway đọc
Dockerfile này trực tiếp, không cần thêm cấu hình gì khác.

### B. VPS tay (PM2)

```bash
pnpm install --prod=false && pnpm --filter api... build
cd apps/api
pm2 start ecosystem.config.js       # lần đầu
pm2 reload ecosystem.config.js      # sau khi build lại, zero-downtime
```

`apps/api/ecosystem.config.js` mặc định `instances: 1` (1 connection
pool Postgres) — chỉ tăng lên cluster mode nếu `DATABASE_URL` đã cấu
hình connection limit phù hợp.

### C. Fly.io

Dùng chung `apps/api/Dockerfile` — Fly đọc Dockerfile giống Railway,
chỉ cần `fly launch --dockerfile apps/api/Dockerfile`.
