import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Instance Prisma dùng chung cho cả monorepo.
 *
 * Prisma 7 bỏ query engine viết bằng Rust; kết nối database giờ đi qua driver
 * adapter chạy thuần Node. Đổi lại: image nhẹ hơn, khởi động nhanh hơn, không
 * còn chuyện thiếu binary engine đúng nền tảng.
 *
 * Hệ quả: connection string phải truyền vào Ở ĐÂY chứ không đọc từ
 * `schema.prisma` nữa — schema không còn nhận `url`.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Thiếu DATABASE_URL — không biết nối tới database nào.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Dev server nạp lại module liên tục. Không cache lại thì mỗi lần sửa file sẽ
// sinh thêm một connection pool, tới lúc Postgres từ chối kết nối mới.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
