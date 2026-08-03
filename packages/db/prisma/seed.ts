import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === "production";

/**
 * Mật khẩu admin KHÔNG còn giá trị mặc định ghi cứng.
 *
 * Bản trước dùng "Admin@123" nằm công khai trong mã nguồn, nghĩa là mọi dự án
 * sinh ra từ template này đều có chung một mật khẩu quản trị mà ai đọc repo
 * cũng biết. Ở production giờ thiếu biến là dừng hẳn; ngoài production thì
 * sinh ngẫu nhiên và in ra đúng một lần.
 */
function resolveAdminPassword(): string {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;

  if (isProduction) {
    throw new Error(
      "Seed production cần SEED_ADMIN_PASSWORD. Không có mật khẩu mặc định — đó là chủ ý.",
    );
  }

  const generated = randomUUID().replaceAll("-", "").slice(0, 20);
  console.log("\n⚠️  SEED_ADMIN_PASSWORD chưa set. Mật khẩu sinh ngẫu nhiên:");
  console.log(`    ${generated}`);
  console.log("    (chỉ hiện một lần — hãy lưu lại ngay)\n");
  return generated;
}

async function main() {
  console.log("🌱 Seeding database...");

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = await argon2.hash(resolveAdminPassword());

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    // Không ghi đè mật khẩu của admin đã tồn tại: seed phải chạy lại được
    // nhiều lần mà không reset thông tin đăng nhập đang dùng.
    update: {},
    create: {
      email: adminEmail,
      name: "System Admin",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  console.log(`✅ Admin sẵn sàng: ${admin.email}`);

  // Dữ liệu mẫu chỉ dành cho dev — mật khẩu bên dưới là hằng số công khai.
  if (isProduction) {
    console.log("↷ Bỏ qua user mẫu (đang ở production)");
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: {
      email: "user@example.com",
      name: "Test User",
      password: await argon2.hash("devpassword123"),
      role: "USER",
    },
  });

  console.log(`✅ User mẫu: ${user.email} (mật khẩu: devpassword123)`);
}

main()
  .catch((e: unknown) => {
    console.error("❌ Seed error:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
