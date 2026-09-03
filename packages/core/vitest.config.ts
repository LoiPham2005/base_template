import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /*
     * Package trong workspace (@repo/db, @repo/contracts) được pnpm symlink tới
     * MÃ NGUỒN .ts chứ không phải bản đã biên dịch, nên Vitest phải transform
     * chúng như mã cục bộ thay vì coi là thư viện dựng sẵn trong node_modules.
     */
    server: {
      deps: {
        inline: [/^@repo\//],
      },
    },

    /*
     * `config/env.ts` validate biến môi trường NGAY LÚC LOAD MODULE — đó là
     * điều ta muốn ở production (sai cấu hình thì hỏng lúc khởi động, không
     * phải ở request đầu tiên), nhưng nó cũng làm mọi test import gián tiếp
     * vào đó không chạy được nếu thiếu biến.
     *
     * Giá trị ở đây là GIẢ và không bao giờ được kết nối tới: test mock Prisma,
     * không chạm database thật. Chỉ cần chúng qua được vòng validate.
     */
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      APP_URL: "http://localhost:3000",
      // Khoá GIẢ, chỉ để các test mã hoá/2FA chạy được. Không bao giờ được
      // dùng lại ở bất kỳ môi trường thật nào.
      ENCRYPTION_KEY: "khoa-gia-chi-dung-trong-test-khong-dung-that",
      // BẬT trong test để kiểm được phần chống lạm dụng SMS. Mặc định thật của
      // hệ thống là TẮT — xem `PHONE_VERIFICATION_ENABLED` trong `config/env.ts`.
      PHONE_VERIFICATION_ENABLED: "1",
      // Bỏ trống REDIS_URL có chủ đích: cache và rate limit dùng bản RAM, nên
      // test chạy được mà không cần dựng Redis.
    },
  },
});
