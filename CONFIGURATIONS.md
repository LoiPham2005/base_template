# Chọn cấu hình cho dự án

Repo này dùng được cho 3 loại dự án khác nhau. Đọc bảng quyết định bên
dưới để chọn đúng 1 cấu hình cho dự án mới, rồi làm theo checklist
tương ứng — đừng để nguyên "mặc định" nếu dự án thực sự không cần.

## Bảng quyết định

| Dự án của bạn có...                                                                          | → Dùng cấu hình              |
| -------------------------------------------------------------------------------------------- | ---------------------------- |
| Chắc chắn sẽ có mobile app, hoặc đối tác/bên thứ 3 gọi API, hoặc đang phân vân chưa chắc     | **A — Web + API**            |
| Chỉ là backend/API, không có web trong repo này (mobile hoặc bên khác tự lo frontend)        | **B — Chỉ API**              |
| Chắc chắn 100% chỉ có 1 web, không bao giờ có client thứ 2 (blog, landing page, tool nội bộ) | **C — Chỉ Next.js + Prisma** |

**Nếu không chắc → chọn A.** Chuyển từ A sang C sau này rất dễ (xoá bớt).
Chuyển từ C sang A giữa chừng tốn công hơn nhiều (phải dựng lại API,
di trú toàn bộ business logic khỏi web).

---

## Cấu hình A — Web + API (mặc định của repo, không cần sửa gì)

Trạng thái hiện tại của `base_template` chính là cấu hình này. Chỉ
cần cài đặt và chạy:

```bash
pnpm install
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# sửa DATABASE_URL trong packages/db/.env và apps/api/.env
pnpm db:migrate
pnpm dev
```

- `apps/web` là BFF mỏng, gọi HTTP sang `apps/api` qua `lib/api.ts`.
- `apps/api` chứa toàn bộ business logic (qua `packages/core`), phục vụ
  cả web lẫn mobile/đối tác sau này bằng cùng 1 REST endpoint.
- Không cần xoá/sửa file nào.

---

## Cấu hình B — Chỉ API (không có web trong repo này)

```bash
rm -rf apps/web
```

Xong. `apps/api` tự đứng độc lập với `packages/core|db|contracts`,
không cần sửa gì thêm — build/dev/deploy như bình thường:

```bash
pnpm install
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm dev:api
```

---

## Cấu hình C — Chỉ Next.js + Prisma (không có NestJS)

Next.js gọi thẳng `packages/core` trong cùng process, không qua HTTP,
không cần chạy thêm service nào. Đã build/typecheck/test/lint và chạy
`next start` thật để xác nhận (log server cho thấy gọi thẳng
`prisma.user.findMany()` trong process) trước khi viết checklist này.

### Bước 1 — Xoá

```bash
rm -rf apps/api
rm -f apps/web/lib/api.ts
```

### Bước 2 — Sửa 4 file

- [ ] **`apps/web/package.json`** — thêm vào `dependencies`:

  ```json
  "@repo/core": "workspace:*",
  "@repo/db": "workspace:*",
  ```

- [ ] **`apps/web/next.config.mjs`** — `transpilePackages` thêm `"@repo/core"`:

  ```js
  transpilePackages: ["@repo/core", "@repo/contracts"],
  ```

- [ ] **`apps/web/eslint.config.js`** — đổi rule (giờ web CHÍNH LÀ nơi
      gọi core, nên không còn cấm `@repo/core` nữa, chỉ còn cấm `@repo/db`
      đi vòng qua core):

  ```js
  const base = require("@repo/eslint-config");
  module.exports = [...base, base.noDirectDbImport];
  ```

- [ ] **`apps/web/.env`** — đổi `API_URL` thành:
  ```
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/base_template?schema=public"
  ```

### Bước 3 — Sửa 2 file ví dụ "users"

- [ ] **`apps/web/app/users/page.tsx`** — đổi:

  ```ts
  // Trước
  import { apiFetch } from "@/lib/api";
  const raw = await apiFetch<unknown>("/users");
  const users = usersResponseSchema.parse(raw);

  // Sau
  import { core } from "@repo/core";
  const users = await core.user.list();
  ```

- [ ] **`apps/web/app/users/actions.ts`** — đổi:
  ```ts
  // Trước
  import { apiFetch, ApiError } from "@/lib/api";
  await apiFetch("/users", { method: "POST", body: JSON.stringify(parsed.data) });
  // catch: err instanceof ApiError && err.status === 409

  // Sau
  import { core, UserAlreadyExistsError } from "@repo/core";
  await core.user.create(parsed.data);
  // catch: err instanceof UserAlreadyExistsError
  ```

### Bước 4 — Cài đặt và chạy

```bash
pnpm install
cp packages/db/.env.example apps/web/.env   # rồi sửa DATABASE_URL
pnpm db:migrate
pnpm dev:web
```

### Áp dụng cho domain mới (không phải "users")

Cùng nguyên tắc: Server Component/Server Action import `core` từ
`@repo/core` và gọi thẳng method của service, thay vì `apiFetch(...)`.

### Lưu ý

Đừng chọn cấu hình này chỉ vì muốn gọn lúc đầu rồi "hy vọng" thêm
mobile/API sau — lúc đó phải làm ngược lại toàn bộ checklist này (dựng
lại `apps/api`, viết lại 2 file ví dụ, đổi ESLint/env) cộng thêm việc
tách business logic ra khỏi chỗ web đang gọi trực tiếp. Chỉ chọn khi
chắc chắn.
