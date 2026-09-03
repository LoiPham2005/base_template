// Prisma 7 không còn tự nạp `.env`. Không có phần này thì mọi lệnh CLI đều
// chết với "Cannot resolve environment variable: DATABASE_URL".
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

// `.env` của riêng packages/db thắng, vì dotenv KHÔNG ghi đè biến đã có.
loadDotenv({ path: new URL(".env", import.meta.url).pathname, quiet: true });
loadDotenv({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

/**
 * Cấu hình cho Prisma CLI (generate, migrate, studio, seed).
 *
 * Prisma 7 bỏ query engine viết bằng Rust: kết nối đi qua driver adapter chạy
 * thuần Node, và connection string không còn đọc từ `schema.prisma` nữa.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    /*
     * Đọc thẳng `process.env` chứ KHÔNG dùng helper `env()` của Prisma.
     *
     * `env()` ném lỗi ngay lúc nạp file này khi biến chưa có — nghĩa là
     * `pnpm install` trên máy vừa clone (chưa có `.env`) sẽ đứt ở bước
     * `postinstall: prisma generate`, dù generate không cần database nào cả.
     *
     * Migrate cần kết nối TRỰC TIẾP, không qua connection pooler. Dùng
     * PgBouncer/Neon/Supabase thì set DIRECT_DATABASE_URL trỏ cổng trực tiếp;
     * runtime vẫn đi qua DATABASE_URL.
     */
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
