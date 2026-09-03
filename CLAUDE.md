# Hướng dẫn cho AI coding agent (và cho người mới)

Đọc file này trước khi sửa bất cứ thứ gì trong repo.

## Kiến trúc: ba luật không được phá

1. **`packages/core` không biết gì về HTTP.** Không import NestJS, không ném
   `HttpException`, không đọc `Request`. Nó ném lỗi nghiệp vụ từ
   `common/errors.ts`; việc dịch sang mã HTTP nằm ở
   `apps/api/src/common/filters/all-exceptions.filter.ts`.

2. **Chỉ `packages/core` được import `@repo/db`.** `apps/api` và `apps/web` bị
   ESLint chặn. Ngoại lệ duy nhất: `apps/worker/src/main.ts` gọi
   `prisma.$disconnect()` lúc tắt.

3. **`apps/web` gọi API qua HTTP**, không import `@repo/core`. Nó là một client
   như app mobile, không phải một phần của backend.

## Trước khi viết code mới

- **Luật validate** → `packages/contracts`. Đừng viết lại Zod schema trong
  controller hay trong form; cả hai đọc từ cùng một chỗ.
- **Quyền mới** → thêm vào `PERMISSIONS` + `PERMISSION_METADATA` +
  `DEFAULT_ROLE_PERMISSIONS` trong `packages/contracts/src/permissions.ts`, rồi
  `pnpm db:seed`. Không viết migration cho việc này.
- **Business logic** → `packages/core/src/<domain>/<domain>.service.ts`, đăng
  ký ở `container.ts`.
- **Endpoint** → `apps/api/src/<domain>/`, copy khuôn của `users/`.

## Khuôn của một controller

```ts
@Get()
@RequirePermissions("order:read")   // KHÔNG kiểm theo vai trò
async list(@Query() query: ListOrdersDto): Promise<Paginated<Order>> {
  return this.orders.list(query);
}
```

- `@Public()` cho endpoint không cần đăng nhập. **Mặc định là PHẢI đăng nhập** —
  guard JWT chạy toàn cục.
- `@RateLimit("login")` cho endpoint nhạy cảm; ngưỡng khai ở `RATE_LIMITS`
  trong `@repo/core`, không viết số trực tiếp ở controller.
- Thao tác nhạy cảm (đổi quyền, khoá tài khoản, xoá) phải gọi
  `audit.record(...)`.
- Đổi vai trò hoặc quyền của ai đó → gọi `permissions.invalidateUser(id)`.
  Quên là thay đổi chỉ có hiệu lực sau 60 giây, và người dùng tưởng hệ thống hỏng.

## Bẫy riêng của repo này

- **`prisma.user.findUnique({ where: { email } })` KHÔNG biên dịch được.**
  `email`/`phone`/`username` ràng buộc bằng **partial unique index** viết tay
  (`WHERE deleted_at IS NULL`), Prisma không biết. Dùng
  `findFirst({ where: { email, deletedAt: null } })`.
- **Băm mã dùng-một-lần: chọn đúng hàm.** Token trong link (256 bit) → `hashOpaqueToken`.
  OTP / mã khôi phục (entropy thấp) → `hashScopedToken(userId, code)`. Dùng nhầm
  hàm cho OTP là mở đường đăng nhập nhầm tài khoản — `SHA-256("123456")` là một
  hằng số.
- **Mọi JWT phải mang `typ`.** `JwtAuthGuard` chỉ nhận `typ: "access"`. Thêm một
  loại token mới mà quên gắn `typ` thì nó bị từ chối (an toàn); gắn `"access"`
  cho một token không phải access là mở cửa hậu.
- **Thao tác lên người dùng phải truyền `actorId`.** Đó là thứ kích hoạt chốt
  chặn bậc quyền lực (`Role.level`). Bỏ trống = coi như hệ thống tự làm và
  KHÔNG kiểm — chỉ đúng cho seed/cron.
- **`Role.level` đồng bộ từ code**, không sửa qua giao diện cho vai trò hệ
  thống. Nó là ràng buộc bảo mật, không phải nhãn hiển thị.

## Những thứ TUYỆT ĐỐI không làm

- **Đừng ký quyền vào JWT.** Token mang `roles` chỉ để hiển thị.
  `PermissionsGuard` luôn tra lại từ database.
- **Đừng dùng `console.log`.** ESLint chặn. Dùng `logger` từ `@repo/core` — nó
  ghi JSON một dòng và che dữ liệu nhạy cảm.
- **Đừng đọc `userId` từ query/body.** Lấy từ token: `@CurrentUser("sub")`.
- **Đừng phân biệt lý do thất bại ở endpoint công khai.** "Email không tồn tại"
  và "sai mật khẩu" phải giống hệt nhau, kể cả về thời gian phản hồi.
- **Đừng thêm thư viện validate thứ hai.** Zod là chuẩn duy nhất ở repo này.
- **Đừng `select` cột `password`** hay `twoFactorSecret`. Xem `USER_SELECT`
  trong `user.service.ts`.
- **Đừng lưu bí mật cần đọc lại dưới dạng thô.** Dùng `encryptSecret` /
  `decryptSecret`. Mật khẩu thì ngược lại — luôn BĂM, không bao giờ mã hoá.
- **Đừng thêm "thiết bị tin cậy" cho 2FA** mà không cân nhắc kỹ: đó là một cơ
  chế bỏ qua 2FA, và bộ khung cố ý không bật sẵn một đường vòng như vậy.

## Chạy kiểm tra

```bash
make check   # format + lint + typecheck + test
```

Test nằm cạnh file được test (`*.test.ts`), mock Prisma, không cần database.
Sửa gì trong `packages/core` thì viết test cho nó — xem
`permission.service.test.ts` làm mẫu.

## Khi thay đổi schema

```bash
make db-migrate     # dev: sinh + áp migration
make db-deploy      # production: chỉ áp migration đã commit
```

Không bao giờ chạy `migrate dev` trên production — nó được thiết kế để reset
database khi phát hiện lệch schema.
