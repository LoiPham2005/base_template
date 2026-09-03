# Chọn cấu hình theo quy mô dự án

Bộ khung mặc định có **ba tiến trình**: `apps/api`, `apps/worker`, `apps/web`.
Không phải dự án nào cũng cần cả ba. Tài liệu này nói rõ mỗi cấu hình được gì,
mất gì, và cắt bỏ bằng lệnh nào.

Chạy script mà không kèm `--yes` để **xem trước** — nó chỉ in ra sẽ làm gì.

---

## A. Đầy đủ (mặc định)

`api` + `worker` + `web`. Không phải làm gì cả.

**Dùng khi:** có (hoặc sẽ có) app mobile, hoặc có gửi email, hoặc có việc chạy
nền — báo cáo, đồng bộ, xử lý ảnh.

**Cần:** Postgres + Redis.

---

## B. Chỉ API

```bash
pnpm scaffold:api-only        # xem trước
pnpm scaffold:api-only:apply  # thực thi
```

Xoá `apps/web`. Giữ nguyên `api` + `worker`.

**Dùng khi:** backend phục vụ app mobile hoặc đối tác bên thứ ba, không có
giao diện web của riêng mình.

**Nhớ làm thêm sau khi chạy script:**

- Gỡ service `web` khỏi `docker-compose.yml` và khối domain tương ứng trong
  `Caddyfile`.
- `APP_URL` giờ không còn trang web nào để trỏ tới. Đổi `WEB_ROUTES` trong
  `packages/core/src/infra/emails.ts` sang deep link của app
  (`myapp://verify-email`), nếu không thì link trong email dẫn tới hư không.

---

## C. Không có worker

```bash
pnpm scaffold:no-worker
pnpm scaffold:no-worker:apply
```

Xoá `apps/worker`, và **bắt buộc** đặt `QUEUE_ENABLED=0` trong `.env`.

**Dùng khi:** dự án nhỏ, gửi rất ít email, không có việc chạy nền nào đáng kể,
và bạn không muốn dựng thêm Redis.

**Mất gì — đọc kỹ phần này:**

- **Thử lại tự động.** Đang có hàng đợi, một lần SMTP nghẽn chỉ làm job lùi vài
  giây rồi chạy lại. Không có nó thì lỗi đó bung thẳng ra request — người dùng
  đăng ký hỏng vì máy chủ mail hắt hơi.
- **Người dùng phải chờ.** Gửi email diễn ra ngay trong request.
- **Không còn job dọn dẹp định kỳ.** Bảng `refresh_tokens` và
  `verification_tokens` chỉ tăng. Tự đặt cron gọi
  `TokenService.purgeExpired()` / `VerificationService.purgeExpired()`.

**⚠️ Cạm bẫy lớn nhất:** xoá `apps/worker` mà **quên** đặt `QUEUE_ENABLED=0`.
Lúc đó app vẫn đẩy job vào Redis trong khi không có worker nào chạy — job nằm
đó mãi, email không bao giờ được gửi, và **không một dòng log nào báo**. Đó
đúng là lý do `QUEUE_ENABLED` được dùng chung cho cả app lẫn `replicas` của
docker-compose: một biến thì không có chỗ cho chiều lệch đó tồn tại.

---

## D. Chỉ một app Next.js — KHÔNG hỗ trợ ở repo này

Bản trước có cấu hình `solo` (web gọi thẳng `packages/core`, không có
`apps/api`). Nó đã bị gỡ bỏ.

**Vì sao:** toàn bộ lớp xác thực và phân quyền giờ nằm ở `apps/api` — guard
JWT, guard quyền, rate limit trên Redis, ánh xạ lỗi nghiệp vụ sang mã HTTP,
nhật ký kiểm toán. Bỏ `apps/api` đi không phải là xoá một thư mục, mà là viết
lại tất cả những thứ đó bằng middleware và Server Action của Next.js.

**Thay vào đó:** bắt đầu từ repo `nextjs_base` — nó được dựng sẵn theo đúng
hình dạng "một app Next.js + Prisma".

---

## Bảng so sánh nhanh

|                   | A. Đầy đủ | B. Chỉ API | C. Không worker |
| ----------------- | --------- | ---------- | --------------- |
| Tiến trình        | 3         | 2          | 2               |
| Cần Redis         | Có        | Có         | Không           |
| Thử lại job       | Có        | Có         | **Không**       |
| Có giao diện web  | Có        | Không      | Có              |
| Dọn token tự động | Có        | Có         | **Tự đặt cron** |

---

## Đổi ý sau này

Cả ba cấu hình đều **thêm lại được** — không có cầu nào bị đốt:

- Cần web trở lại: `git revert` commit của scaffold, hoặc copy `apps/web` từ
  một bản base_template mới.
- Cần worker trở lại: khôi phục `apps/worker`, đặt `QUEUE_ENABLED=1`, thêm
  `REDIS_URL`. Không phải sửa một dòng nào trong `packages/core` — `enqueue()`
  vốn đã hỗ trợ cả hai chế độ.
