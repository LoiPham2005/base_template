import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@repo/db";
import { UserAlreadyExistsError, UserService } from "./user.service";

function createMockDb(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: "u1",
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      ...overrides,
    },
  } as unknown as PrismaClient;
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test" });
}

describe("UserService", () => {
  describe("create", () => {
    it("tạo user khi email chưa tồn tại", async () => {
      const db = createMockDb();
      const service = new UserService(db);

      const result = await service.create({ email: "a@example.com", name: "A" });

      expect(result).toMatchObject({ email: "a@example.com", name: "A" });
      expect(db.user.create).toHaveBeenCalledOnce();
    });

    it("không select cột password, nên nó không thể rò ra khỏi service", async () => {
      const db = createMockDb();
      await new UserService(db).create({ email: "a@example.com" });

      const args = vi.mocked(db.user.create).mock.calls[0]?.[0] as { select: object };
      expect(args.select).not.toHaveProperty("password");
    });

    it("lưu password null — KHÔNG phải chuỗi rỗng — khi không truyền mật khẩu", async () => {
      const db = createMockDb();
      await new UserService(db).create({ email: "a@example.com" });

      // Chuỗi rỗng là một mật khẩu "hợp lệ" nhìn từ tầng dữ liệu; null mới
      // diễn đạt đúng "chưa đặt mật khẩu".
      const args = vi.mocked(db.user.create).mock.calls[0]?.[0] as {
        data: { password: unknown };
      };
      expect(args.data.password).toBeNull();
    });

    it("mặc định role là USER khi không chỉ định", async () => {
      const db = createMockDb();
      await new UserService(db).create({ email: "a@example.com" });

      const args = vi.mocked(db.user.create).mock.calls[0]?.[0] as { data: { role: string } };
      expect(args.data.role).toBe("USER");
    });

    it("đổi lỗi P2002 của database thành UserAlreadyExistsError", async () => {
      // Dựa vào unique constraint thay vì "kiểm tra rồi mới ghi": hai request
      // đồng thời cùng email đều vượt qua bước kiểm tra, chỉ database phân xử được.
      const db = createMockDb({
        create: vi.fn().mockRejectedValue(prismaError("P2002")),
      });

      await expect(new UserService(db).create({ email: "dup@example.com" })).rejects.toThrow(
        UserAlreadyExistsError,
      );
    });

    it("không nuốt lỗi lạ", async () => {
      const db = createMockDb({
        create: vi.fn().mockRejectedValue(new Error("connection lost")),
      });

      await expect(new UserService(db).create({ email: "a@example.com" })).rejects.toThrow(
        "connection lost",
      );
    });
  });

  describe("list", () => {
    it("mặc định lấy 50 bản ghi", async () => {
      const db = createMockDb();
      await new UserService(db).list();

      const args = vi.mocked(db.user.findMany).mock.calls[0]?.[0] as { take: number };
      expect(args.take).toBe(50);
    });

    it("chặn trần ở 100 dù caller yêu cầu nhiều hơn", async () => {
      const db = createMockDb();
      await new UserService(db).list({ take: 100_000 });

      const args = vi.mocked(db.user.findMany).mock.calls[0]?.[0] as { take: number };
      expect(args.take).toBe(100);
    });
  });
});
