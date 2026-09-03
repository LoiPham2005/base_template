# base_template

Khung backend **NestJS + Prisma** dùng chung cho mọi dự án, kèm sẵn một app
Next.js mỏng làm giao diện quản trị. Mục tiêu: cài xong là **chỉ còn viết
nghiệp vụ** — xác thực, phân quyền, hàng đợi, email, kho tệp, nhật ký, deploy
đều đã có.

```
apps/
  api/       NestJS + Fastify — REST /api/v1, guard, rate limit, Swagger
  worker/    BullMQ — job nền: gửi mail, push, dọn token định kỳ
  web/       Next.js (App Router) — BFF mỏng, KHÔNG chứa business logic
packages/
  core/      Toàn bộ business logic + hạ tầng (cache, queue, mail, storage…)
  db/        Prisma schema + migration + seed
  contracts/ Zod schema + danh mục quyền — dùng chung web / api / worker
  config/    eslint + tsconfig dùng chung
```

---

## Có sẵn những gì

**Xác thực**

- Đăng ký / đăng nhập bằng email **hoặc** tên đăng nhập (một ô nhập duy nhất)
- Access token JWT ngắn hạn + refresh token **xoay vòng**, lưu SHA-256 trong DB
- **Phát hiện token bị dùng lại** → huỷ toàn bộ phiên của tài khoản đó
- Quản lý "thiết bị đang đăng nhập": xem, đăng xuất từng thiết bị hoặc tất cả
- Xác thực email, quên/đặt lại/đổi mật khẩu (kèm email thông báo đã đổi)
- Khoá tạm khi sai mật khẩu liên tiếp + rate limit theo IP trên Redis
- Argon2id (một thuật toán duy nhất), tự băm lại khi bạn siết tham số
- **2FA (TOTP)**: Google Authenticator/Authy/1Password, mã khôi phục, bí mật
  mã hoá AES-256-GCM trong database
- **Đổi email an toàn**: xác thực địa chỉ mới + cảnh báo địa chỉ cũ
- OAuth Google / GitHub / Facebook / Apple (PKCE, state ký JWT)

**Phân quyền (RBAC)**

- Một người **nhiều vai trò**; vai trò tạo/sửa được lúc chạy từ giao diện
- **Bậc quyền lực** (`Role.level`) — ADMIN không đụng được vào SUPER_ADMIN, và
  không tạo được tài khoản mạnh hơn mình
- Quyền chi tiết `<tài-nguyên>:<hành-động>`, danh mục nằm trong code (TypeScript
  bắt lỗi gõ sai), việc gán nằm trong database
- Ngoại lệ theo từng cá nhân: **cấp thêm** hoặc **tước bỏ** (tước luôn thắng),
  có thể đặt **hạn tự hết**
- Kiểm quyền luôn tra lại từ database (có cache), **không** đọc từ token

**Hạ tầng**

- Hàng đợi BullMQ + tiến trình worker riêng, có job định kỳ dọn token
- Cache & rate limit dùng chung qua Redis, tự lùi về RAM khi chưa có Redis
- Gửi mail qua SMTP (dev thì ghi ra log; production thiếu cấu hình thì **báo lỗi**)
- Kho tệp S3/MinIO/R2 bằng presigned URL — API không nhận byte nào
- Log JSON một dòng, che dữ liệu nhạy cảm, có mã định danh request
- Nhật ký kiểm toán cho mọi hành động nhạy cảm
- Thông báo trong app + thiết bị nhận push (chỗ cắm Firebase đã dọn sẵn)
- Health check tách `liveness` / `readiness`

**Vận hành**

- Docker Compose đầy đủ (Postgres, Redis, Mailpit, api, worker, web)
- Deploy VPS bằng PM2, deploy Docker, Caddyfile mẫu
- CI: format, lint, typecheck, test, migrate thật, seed thật, build Docker
- 45 unit test cho phần bảo mật cốt lõi

---

## Yêu cầu

- Node >= 22 (`.nvmrc`)
- pnpm >= 9 (`corepack enable`)
- Docker (cho Postgres/Redis ở máy dev) — hoặc Postgres/Redis cài sẵn

## Cài lần đầu

```bash
make setup
```

Lệnh đó làm đúng thứ tự bắt buộc: tạo `.env` → cài deps → bật Postgres/Redis/
Mailpit → migrate → seed. **Mở `.env` sửa `JWT_SECRET`** trước khi dùng thật:

```bash
openssl rand -base64 48
```

Muốn có tài khoản quản trị đầu tiên thì điền `ADMIN_EMAIL` / `ADMIN_PASSWORD`
rồi chạy lại `make db-seed`. Cố ý **không** có tài khoản mặc định viết cứng
trong mã nguồn — một cặp `admin/admin123` như vậy sẽ theo dự án lên tận
production.

Ở môi trường dev, `db:seed` còn tạo 4 tài khoản mẫu (mật khẩu chung
`matkhau123`): `admin@dev.local`, `manager@dev.local`, `staff@dev.local`,
`user@dev.local`.

## Chạy dev

```bash
make dev          # web + api + worker cùng lúc
make dev-api      # http://localhost:3001/docs   (Swagger)
make dev-web      # http://localhost:3000
make dev-worker   # http://localhost:3002/health (số job trong hàng đợi)
```

Email ở dev bị Mailpit bắt lại — mở **http://localhost:8025** để đọc link xác
thực/đặt lại mật khẩu.

---

## Kiến trúc: vì sao web KHÔNG gọi thẳng Prisma

```
Web (Next.js)  ──HTTP──▶  API (NestJS)  ──▶  packages/core ──▶ Prisma ──▶ DB
Mobile         ──HTTP──▶ ↗ (CÙNG endpoint, CÙNG validation, CÙNG phân quyền)
Worker         ─────────────────────────▶ packages/core ──▶ Prisma ──▶ DB
```

`apps/web` chỉ là BFF: Server Component / Server Action gọi `apiFetch()` trong
`lib/api.ts`, y hệt cách mobile gọi REST. Đổi lại một nhịp gọi mạng nội bộ mỗi
request, và nhận được điều quan trọng hơn nhiều: **không có đường tắt nào bỏ
qua một luật nghiệp vụ**. Thêm client mới (app, đối tác, webhook) không cần
kiểm lại xem có chỗ nào quên áp quyền.

`apps/worker` thì import thẳng `packages/core` — nó không phải một client, nó
là chính hệ thống chạy ở tiến trình khác.

**ESLint enforce sẵn hai luật này**: `apps/api` không import `@repo/db`,
`apps/web` không import `@repo/core` lẫn `@repo/db`. Thấy lỗi
`no-restricted-imports` ở hai chỗ đó nghĩa là logic đang bị đặt sai lớp.

---

## Thêm một domain mới (ví dụ "order")

1. **Schema** — thêm model vào `packages/db/prisma/schema.prisma`, chạy
   `make db-migrate`.

2. **Contracts** — `packages/contracts/src/order.ts`: Zod schema cho input/
   output, export ở `index.ts`. Thêm quyền `order:read`, `order:create`… vào
   `PERMISSIONS` và `PERMISSION_METADATA` trong `permissions.ts`, gán vào vai
   trò trong `DEFAULT_ROLE_PERMISSIONS`, rồi `make db-seed`.

3. **Core** — `packages/core/src/order/order.service.ts`, nhận `PrismaClient`
   qua constructor. Đăng ký trong `container.ts`. Viết test cạnh file service
   (mock Prisma, không cần database).

4. **API** — `apps/api/src/orders/`: copy đúng khuôn của `users/`.

   ```ts
   @Get()
   @RequirePermissions("order:read")
   async list(@Query() query: ListOrdersDto) { … }
   ```

   Module khai `{ provide: OrderService, useValue: core.order }`.

5. **Web / Mobile** — gọi `apiFetch<Order[]>("/orders")`. Cùng một endpoint.

Business logic viết **một lần** trong `packages/core`; web và mobile không bao
giờ có bản sao thứ hai của validation hay business rule.

---

## Danh sách endpoint

Tất cả nằm dưới `/api/v1`. Thành công trả `{ data: … }`, lỗi trả
`{ error: { code, message, fields? } }` — client nên `switch` theo `code`,
**không** theo `message`.

| Nhóm      | Endpoint                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth      | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout`                                                                   |
|           | `GET /auth/me` · `PATCH /auth/me` · `POST /auth/change-password`                                                                                          |
|           | `POST /auth/forgot-password` · `POST /auth/reset-password`                                                                                                |
|           | `POST /auth/verify-email` · `POST /auth/verify-email/request`                                                                                             |
| Phiên     | `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `DELETE /auth/sessions`                                                                              |
| OAuth     | `GET /auth/oauth/providers` · `GET /auth/oauth/:provider/start` · `POST /auth/oauth/exchange` · `GET /auth/oauth/linked` · `DELETE /auth/oauth/:provider` |
| Users     | `GET /users` · `GET /users/:id` · `POST /users` · `PATCH /users/:id` · `DELETE /users/:id`                                                                |
|           | `PUT /users/:id/roles` · `PUT /users/:id/status` · `PUT /users/:id/permissions`                                                                           |
| RBAC      | `GET /permissions` · `GET /roles` · `POST /roles` · `PATCH /roles/:key` · `DELETE /roles/:key`                                                            |
| Thông báo | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications`                                                                          |
| Thiết bị  | `POST /devices` · `GET /devices` · `DELETE /devices`                                                                                                      |
| Nhật ký   | `GET /audit-logs`                                                                                                                                         |
| Tệp       | `POST /files/presign`                                                                                                                                     |
| Health    | `GET /health` · `GET /health/ready`                                                                                                                       |

Swagger đầy đủ ở `/docs` (bật ở dev, tắt trên production trừ khi
`ENABLE_SWAGGER=true`).

---

## Bảo mật: những quyết định đã chốt

Đây là phần đáng đọc nhất trước khi sửa. Mỗi dòng đều có ghi chú "vì sao" ngay
trong mã nguồn.

| Quyết định                                                   | Vì sao                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Access token 15 phút                                         | JWT đã ký thì không thu hồi được — hạn của nó là thứ giới hạn thiệt hại  |
| Refresh token xoay vòng, lưu SHA-256                         | Rò database không đồng nghĩa với rò phiên đăng nhập                      |
| Dùng lại token đã thu hồi → huỷ hết phiên                    | Chỉ có một cách giải thích: token đã bị đánh cắp                         |
| Mọi nhánh đăng nhập sai đều trả cùng một lỗi, cùng thời gian | Nếu không, đo thời gian phản hồi là dò được email nào đã đăng ký         |
| Quyền tra từ DB mỗi request (có cache), không đọc từ token   | Người vừa bị tước quyền phải mất quyền NGAY, không phải sau 15 phút      |
| "Tước quyền" cá nhân thắng mọi vai trò                       | Cần chặn gấp thì phải chặn được ngay                                     |
| Không cho tự đổi vai trò / tự khoá / tự xoá chính mình       | Quản trị viên cuối cùng tự khoá mình ra ngoài là không có đường quay lại |
| `forgot-password` luôn trả 204                               | Bất kỳ khác biệt nào cũng biến nó thành công cụ dò người dùng            |
| Đổi mật khẩu → thu hồi mọi phiên khác                        | Kịch bản điển hình của luồng này là tài khoản đã bị chiếm                |
| Upload bằng presigned URL                                    | API không phải nới `bodyLimit` cho mọi endpoint                          |
| `CORS_ORIGIN=*` bị chặn trên production                      | Wildcard + credentials là cấu hình mâu thuẫn                             |
| `JWT_SECRET` không có giá trị mặc định                       | Thà không khởi động được, còn hơn ký bằng khoá ai cũng biết              |

---

## Cắt bớt cho dự án nhỏ

```bash
pnpm scaffold:api-only     # chỉ API cho mobile — xoá apps/web
pnpm scaffold:no-worker    # job chạy thẳng trong request — xoá apps/worker
```

Chạy không kèm `--yes` để xem trước sẽ đổi gì. Chi tiết đánh đổi:
[CONFIGURATIONS.md](./CONFIGURATIONS.md).

Chỉ cần **một** app Next.js duy nhất? Dùng repo `nextjs_base` thay vì cắt repo
này — toàn bộ lớp xác thực/phân quyền ở đây nằm trong `apps/api`, bỏ nó đi là
phải viết lại chứ không phải xoá một thư mục.

---

## Deploy

```bash
make deploy-docker    # Docker Compose (khuyến nghị)
make deploy-vps       # PM2 + Node trực tiếp trên VPS
```

Trước khi deploy production, kiểm đủ 5 điều:

1. `JWT_SECRET` là chuỗi ngẫu nhiên **riêng của môi trường đó** (khác dev).
2. `CORS_ORIGIN` là domain cụ thể, không phải `*`.
3. `APP_URL` trỏ đúng domain thật — sai là link trong email vô dụng. Đặt thêm
   `API_PUBLIC_URL` nếu API ở tên miền riêng (nếu không, callback OAuth hỏng).
4. `SMTP_HOST` đã cấu hình. Thiếu thì app **báo lỗi** thay vì nuốt email.
5. `REDIS_URL` đã có nếu chạy từ 2 instance trở lên — không thì rate limit bị
   nhân lên theo số instance.
6. `ENCRYPTION_KEY` đã đặt nếu bạn dùng 2FA — và **không bao giờ đổi** sau khi
   đã có người bật, vì đổi là mọi người phải cài lại 2FA từ đầu.

Kiểm tra sau khi deploy: `GET /api/v1/health/ready` phải trả `status: "ok"`.
Thành phần nào chưa cấu hình sẽ hiện `disabled` (bình thường), hỏng thì hiện
`down`.

---

## Lệnh hay dùng

```bash
make check        # format + lint + typecheck + test — chạy trước khi commit
make db-studio    # xem/sửa dữ liệu bằng giao diện
make db-reset     # xoá sạch DB rồi dựng lại (CHỈ dev)
make docker-logs  # xem log mọi container
```

`make help` liệt kê đầy đủ.
