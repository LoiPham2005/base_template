import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "@prisma/client";

/**
 * Nạp `.env` ở GỐC workspace.
 *
 * `@repo/core` có sẵn hàm này (`loadEnvFiles`), nhưng KHÔNG import được ở đây:
 * core phụ thuộc vào `@repo/db`, nên chiều ngược lại sẽ tạo vòng lặp phụ thuộc
 * giữa hai package — turbo không xếp được thứ tự build, và pnpm cảnh báo.
 *
 * Mười dòng lặp lại rẻ hơn nhiều so với một vòng lặp phụ thuộc.
 */
function loadRootEnv(): void {
  // `.env` riêng của packages/db (nếu có) thắng, vì dotenv không ghi đè biến
  // đã tồn tại — file nạp trước thắng.
  loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

  let current = resolve(process.cwd());
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      loadDotenv({ path: join(current, ".env"), quiet: true });
      return;
    }

    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

loadRootEnv();
import { seedRbac } from "./seeds/seed-rbac";
import { seedAdmin } from "./seeds/seed-admin";
import { seedDev } from "./seeds/seed-dev";

/**
 * Chạy: `pnpm db:seed`
 *
 * ---
 * SEED PHẢI CHẠY LẠI ĐƯỢC NHIỀU LẦN
 *
 * Đây là ràng buộc bắt buộc, không phải mong muốn: seed được gọi sau MỖI lần
 * deploy (xem `deploy-vps.sh`), nên một seed chỉ chạy được lần đầu sẽ làm hỏng
 * lần deploy thứ hai. Mọi thao tác ở đây đều là `upsert` hoặc `createMany` với
 * `skipDuplicates`.
 *
 * ---
 * BA PHẦN, TÁCH RIÊNG THEO MỨC ĐỘ AN TOÀN
 *
 *   seedRbac  — quyền & vai trò. Chạy ở MỌI môi trường, kể cả production.
 *   seedAdmin — tài khoản quản trị đầu tiên, đọc từ ADMIN_EMAIL/ADMIN_PASSWORD.
 *   seedDev   — dữ liệu mẫu có mật khẩu công khai. CHỈ dev.
 */
const prisma = new PrismaClient();

async function main() {
  const isProduction = process.env.NODE_ENV === "production";

  console.log(`🌱 Seeding (NODE_ENV=${process.env.NODE_ENV ?? "development"})…`);

  await seedRbac(prisma);
  console.log("✓ Đã đồng bộ quyền và vai trò hệ thống");

  await seedAdmin(prisma);

  if (isProduction) {
    console.log("⏭️  Bỏ qua dữ liệu mẫu: đang ở production");
  } else {
    await seedDev(prisma);
  }

  console.log("🌱 Xong.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed thất bại:", error);
    // Exit code khác 0 là thứ làm `deploy-vps.sh` dừng lại. Không có dòng này
    // thì seed hỏng vẫn được coi là deploy thành công.
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
