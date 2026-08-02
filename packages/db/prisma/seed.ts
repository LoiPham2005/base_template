import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  const adminPassword = await argon2.hash("Admin@123");
  const userPassword = await argon2.hash("User@123");

  // Create default admin user (password: Admin@123)
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "System Admin",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  // Create standard test user (password: User@123)
  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: {
      email: "user@example.com",
      name: "Test User",
      password: userPassword,
      role: "USER",
    },
  });

  console.log("✅ Seed completed successfully:");
  console.log(`- Admin: ${admin.email}`);
  console.log(`- User: ${user.email}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
