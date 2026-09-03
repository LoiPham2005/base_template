---
name: base-template
description: Kiến trúc, quy tắc bắt buộc và bẫy đã gặp của base_template (monorepo pnpm + Turborepo, NestJS 11/Fastify + Next.js 16 + worker, Prisma 7, RBAC đa vai trò, 2FA, passkey). Đọc TRƯỚC khi sửa bất cứ thứ gì trong repo này — thêm endpoint, thêm service, đụng vào schema, phân quyền, xác thực, hàng đợi, hoặc chạy test/deploy.
---

# base_template

Bộ khung **monorepo có API riêng**: một NestJS API phục vụ nhiều client (web, mobile, đối tác),
một web Next.js, một worker chạy job nền. Toàn bộ nghiệp vụ nằm ở `packages/core` để cả ba tiến
trình dùng chung.

**Mọi chú thích, thông báo lỗi, tên test đều bằng TIẾNG VIỆT có dấu.** Viết tiếng Anh vào là lạc
lõng với phần còn lại của repo.

> Chọn nhầm bộ khung là sai lầm đắt nhất. Nếu dự án **chỉ có web** và không có app mobile hay đối
> tác gọi API, dùng `nextjs_base` — nó ít hơn 3 tiến trình và không có bước build package trung
> gian. Chỉ chọn repo này khi API là sản phẩm phục vụ nhiều client.

---

## 1. Bố cục và ranh giới package

```
apps/api      NestJS 11 + Fastify 5 — REST /api/v1, Swagger /docs
apps/web      Next.js 16 App Router — chỉ giao diện, GỌI api qua HTTP
apps/worker   BullMQ consumer — chạy job nền, không mở cổng HTTP

packages/db         Prisma schema + client dùng chung
packages/contracts  Zod schema + type + hằng số. KHÔNG chứa logic, KHÔNG import Prisma
packages/core       TOÀN BỘ nghiệp vụ. Nơi DUY NHẤT được import Prisma Client
packages/config     eslint/tsconfig/prettier dùng chung
```

**Luật ranh giới, ESLint enforce:**

- Chỉ `packages/core` được `import { prisma } from "@repo/db"`. `apps/api` gọi service, không
  bao giờ query database trực tiếp.
- `packages/contracts` không được import `@repo/db` — nó là hợp đồng, phải build được cho cả
  client Dart/Kotlin đọc qua OpenAPI.
- `packages/core` không được biết gì về HTTP. Không `HttpException`, không `Request`. Ném
  `DomainError`; việc ánh xạ sang mã HTTP nằm ở `apps/api/src/common/filters/`.

**Vì sao tách package thay vì viết thẳng vào api:** `apps/worker` gửi email và chạy job cần đúng
những service mà API dùng. Không tách thì hoặc phải chép code, hoặc worker phải gọi HTTP vào chính
API của mình.

---

## 2. Thêm một tính năng: đi theo đúng thứ tự này

Ví dụ thêm thực thể `Booking`:

1. `packages/db/prisma/schema.prisma` — thêm model. Chạy `pnpm db:migrate`.
2. `packages/contracts/src/booking.ts` — Zod schema cho input/output + export trong `index.ts`.
3. `packages/core/src/booking/booking.service.ts` — nghiệp vụ. Constructor nhận `PrismaClient`.
4. `packages/core/src/container.ts` — đăng ký instance.
5. `apps/api/src/booking/booking.controller.ts` + `.module.ts` — chỉ nhận request, gọi service,
   trả kết quả. Khai `@RequirePermissions("booking:read")`.
6. `packages/contracts/src/permissions.ts` — thêm quyền mới vào danh mục, rồi `pnpm db:seed`.

**Bỏ bước 6 là quyền mới không tồn tại trong database**, và mọi request đều 403 mà không rõ vì sao.

---

## 3. Quy tắc BẮT BUỘC

### Kiểm quyền

- Mọi controller mới phải khai `@RequirePermissions(...)` hoặc `@Public()`. Không khai là mặc
  định **cần đăng nhập** — nhưng đừng dựa vào đó, hãy nói rõ ý định.
- Kiểm theo **QUYỀN**, không bao giờ theo tên vai trò. `if (user.role === "ADMIN")` là sai; vai
  trò do quản trị viên tạo lúc chạy, còn quyền mới là thứ code tham chiếu tới.
- Danh mục quyền nằm trong **code** (`packages/contracts/src/permissions.ts` — TypeScript bắt lỗi
  gõ sai). Việc GÁN quyền cho vai trò nằm trong **database** (sửa được lúc chạy, không cần deploy).

### Một người mang NHIỀU vai trò

Quyền cuối cùng = **hợp(mọi vai trò) + cấp riêng − tước riêng**. Cấm (`isGranted: false`) LUÔN
thắng, kể cả khi một vai trò khác đang cho.

`Role.level` chặn leo thang đặc quyền: `assertCanActOn` từ chối khi mục tiêu có `level` ≥ `level`
của người thao tác. Không có nó thì một ADMIN sửa/xoá được SUPER_ADMIN.

### ⚠️ Mọi đường ghi thẩm quyền PHẢI xoá cache

Quyền được cache 60 giây. Gán vai trò, cấp/tước quyền lẻ, xoá tài khoản → gọi
`permissions.invalidateUser(userId)`. Sửa bảng phân quyền của một vai trò → `invalidateAll()`.

Quên chiều "cấp thêm" chỉ gây khó hiểu (admin tick quyền, thử ngay, vẫn 403). Quên chiều "tước bỏ"
là **lỗ hổng thật**: người vừa bị gỡ vai trò vẫn thao tác được thêm một phút.

### Token: mỗi loại chỉ dùng đúng một việc

Hệ thống ký nhiều loại JWT bằng CÙNG một khoá: `access`, `2fa`, `oauth_state`, `oauth_exchange`,
`webauthn_reg`, `webauthn_auth`. Chữ ký đúng **không** chứng minh token dùng vào việc gì.

`JwtAuthGuard` chỉ nhận `typ: "access"`. Mỗi nơi đọc vé phải kiểm đúng `typ` của nó. Thiếu phép
kiểm đó là 2FA bị bỏ qua sạch: cầm vé 2FA gọi được mọi endpoint.

### Mật khẩu và mã

- Mật khẩu: **Argon2id** (`@node-rs/argon2`). bcrypt đã bị gỡ, đừng thêm lại.
- Mã ngắn (OTP, mã khôi phục): `hashScopedToken(scope, token)` — SHA-256 có tiền tố phạm vi.
  Không có tiền tố thì mã của luồng này dùng được ở luồng kia.

### Prisma 7

- `schema.prisma` **không còn `url`** trong `datasource`. Chuỗi kết nối ở hai chỗ:
  `packages/db/prisma.config.ts` (CLI/Migrate) và driver adapter trong `packages/db/src/index.ts`
  (runtime).
- `new PrismaClient()` không có adapter sẽ ném lỗi NGAY lúc khởi tạo. Script ngoài app (seed, cron)
  phải tự dựng `PrismaPg`.
- Sau khi sửa schema: `pnpm db:generate` rồi tin `pnpm typecheck` qua terminal — IDE hay cache type
  cũ một nhịp.

### Thời gian và chỉ mục

- Mọi cột thời gian là `@db.Timestamptz(3)`. Mặc định của Prisma là `timestamp(3)` không múi giờ,
  và một câu SQL viết tay sẽ lệch vài tiếng mà không có gì báo.
- `email`/`phone`/`username` **cố ý KHÔNG có `@unique`** ở tầng Prisma — dùng partial unique index
  `WHERE deleted_at IS NULL` trong migration, để xoá mềm rồi vẫn đăng ký lại được.
- Audit log **không có khoá ngoại tới `users`**: nhật ký phải sống lâu hơn đối tượng nó ghi lại.

---

## 4. Lệnh hay dùng

```bash
pnpm dev                 # cả 3 tiến trình qua turbo
pnpm dev:api             # chỉ API — http://localhost:3001/docs
pnpm check               # format + lint + typecheck + test. Chạy trước khi coi là xong việc
pnpm db:migrate          # tạo + áp migration (dev)
pnpm db:seed             # đồng bộ danh mục quyền xuống database
pnpm --filter @repo/core test   # test một package
```

⚠️ `pnpm typecheck` tự lo thứ tự build package (turbo `dependsOn: ["^build"]`) — **không** cần
build `@repo/core` bằng tay trước.

⚠️ `pnpm install` chạy `postinstall: prisma generate` trong `packages/db`. Nó phải chạy được khi
CHƯA có `.env` — vì vậy `prisma.config.ts` đọc thẳng `process.env` chứ không dùng helper `env()`
của Prisma (helper đó ném lỗi ngay lúc nạp file).

---

## 5. Bẫy đã gặp thật

| Triệu chứng                                         | Nguyên nhân                                                  |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm install` đứt ở `postinstall`                  | `prisma.config.ts` dùng `env()` khi chưa có `.env`           |
| Cấp quyền xong gọi API vẫn 403                      | quên `permissions.invalidateUser()`                          |
| Type Prisma sai sau khi sửa schema                  | chưa `pnpm db:generate`, hoặc IDE cache trễ                  |
| `PrismaClient was instantiated without any options` | thiếu driver adapter (Prisma 7)                              |
| Quyền mới luôn 403                                  | quên `pnpm db:seed` sau khi thêm vào danh mục                |
| Swagger UI trắng                                    | `@fastify/static` bị peer conflict — cần override `>=10.1.3` |

**Đừng thêm `arctic`** để làm OAuth — tác giả đã deprecate. OAuth ở đây tự viết bằng `fetch`/`jose`.

**Đừng liệt kê quyền của SUPER_ADMIN bằng tay.** Nó dùng `permissions: "*"`, giải ra qua
`resolveSeedPermissions()`. Liệt kê tay thì thêm quyền mới lại phải nhớ bổ sung, và quên một lần
là SUPER_ADMIN mất quyền đó mà không ai để ý.
