import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@repo/db";
import { UserService } from "./user.service";
import {
  DuplicateFieldError,
  SelfActionForbiddenError,
  UnknownRoleKeyError,
} from "../common/errors";

const USER_ROW = {
  id: "u1",
  email: "a@b.com",
  phone: null,
  username: null,
  status: "ACTIVE",
  emailVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  profile: { fullName: "Nguyễn A", avatarUrl: null },
  userRoles: [{ role: { key: "USER" } }],
};

function createDb(
  overrides: { user?: Record<string, unknown>; role?: Record<string, unknown> } = {},
) {
  return {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(USER_ROW),
      findMany: vi.fn().mockResolvedValue([USER_ROW]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(USER_ROW),
      update: vi.fn().mockResolvedValue(USER_ROW),
      ...overrides.user,
    },
    role: {
      findMany: vi.fn().mockResolvedValue([{ id: "r-user", key: "USER" }]),
      ...overrides.role,
    },
    userRole: { deleteMany: vi.fn(), createMany: vi.fn() },
    userProfile: { upsert: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(createTx()) : [],
    ),
  } as unknown as PrismaClient;
}

function createTx() {
  return {
    user: { update: vi.fn().mockResolvedValue(USER_ROW) },
    userRole: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
}

const baseInput = { email: "a@b.com", status: "ACTIVE" as const };

describe("UserService", () => {
  describe("create", () => {
    it("băm mật khẩu, KHÔNG bao giờ lưu chuỗi gốc", async () => {
      const db = createDb();

      await new UserService(db).create({ ...baseInput, password: "matkhau123" });

      const data = vi.mocked(db.user.create).mock.calls[0]![0]!.data as { password: string };
      expect(data.password).not.toBe("matkhau123");
      expect(data.password).toMatch(/^\$argon2id\$/);
    });

    it("lưu password NULL — không phải chuỗi rỗng — khi không truyền mật khẩu", async () => {
      // Chuỗi rỗng là một mật khẩu "hợp lệ" nhìn từ tầng dữ liệu; null mới nói
      // đúng rằng tài khoản này chưa đặt mật khẩu.
      const db = createDb();

      await new UserService(db).create(baseInput);

      const data = vi.mocked(db.user.create).mock.calls[0]![0]!.data as { password: null };
      expect(data.password).toBeNull();
    });

    it("mặc định gán vai trò USER khi không chỉ định", async () => {
      const db = createDb();

      await new UserService(db).create(baseInput);

      expect(db.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: { in: ["USER"] } } }),
      );
    });

    it("từ chối vai trò không tồn tại thay vì lặng lẽ bỏ qua", async () => {
      // Bỏ qua nghĩa là admin bấm "gán vai trò KE_TOAN", hệ thống báo thành
      // công, mà người dùng không nhận được vai trò nào.
      const db = createDb({ role: { findMany: vi.fn().mockResolvedValue([]) } });

      await expect(
        new UserService(db).create({ ...baseInput, roleKeys: ["KE_TOAN"] }),
      ).rejects.toBeInstanceOf(UnknownRoleKeyError);
    });

    it("báo đúng TRƯỜNG bị trùng, không phải lỗi chung chung", async () => {
      const db = createDb({
        user: {
          findFirst: vi.fn().mockResolvedValue({ email: "a@b.com", username: null, phone: null }),
        },
      });

      await expect(new UserService(db).create(baseInput)).rejects.toBeInstanceOf(
        DuplicateFieldError,
      );
    });

    it("không select cột password, nên nó không thể rò ra khỏi service", async () => {
      const db = createDb();

      const user = await new UserService(db).create(baseInput);

      const select = vi.mocked(db.user.create).mock.calls[0]![0]!.select as Record<string, unknown>;
      expect(select.password).toBeUndefined();
      expect(user).not.toHaveProperty("password");
    });

    it("không nuốt lỗi lạ của database", async () => {
      const db = createDb({
        user: { create: vi.fn().mockRejectedValue(new Error("connection lost")) },
      });

      await expect(new UserService(db).create(baseInput)).rejects.toThrow("connection lost");
    });
  });

  describe("list", () => {
    it("bỏ qua tài khoản đã xoá mềm theo mặc định", async () => {
      const db = createDb();

      await new UserService(db).list({ page: 1, limit: 20, includeDeleted: false });

      const args = vi.mocked(db.user.findMany).mock.calls[0]![0]!;
      expect(args.where).toMatchObject({ deletedAt: null });
      expect(args.take).toBe(20);
      expect(args.skip).toBe(0);
    });

    it("trả metadata phân trang khớp với tổng số bản ghi", async () => {
      const db = createDb({ user: { count: vi.fn().mockResolvedValue(45) } });

      const page = await new UserService(db).list({ page: 2, limit: 20, includeDeleted: false });

      expect(page.meta).toMatchObject({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
        hasNext: true,
      });
    });
  });

  describe("chốt chặn tự bắn vào chân mình", () => {
    it("không cho tự đổi vai trò của chính mình", async () => {
      // Không có chốt này thì quản trị viên cuối cùng tự khoá mình ra ngoài chỉ
      // bằng một cú bấm nhầm, và không còn ai vào sửa được.
      const db = createDb({ user: { findFirst: vi.fn().mockResolvedValue({ id: "u1" }) } });

      await expect(
        new UserService(db).update("u1", { roleKeys: ["USER"] }, { actorId: "u1" }),
      ).rejects.toBeInstanceOf(SelfActionForbiddenError);
    });

    it("không cho tự khoá và tự xoá chính mình", async () => {
      const db = createDb();
      const service = new UserService(db);

      await expect(service.setStatus("u1", "BANNED", { actorId: "u1" })).rejects.toBeInstanceOf(
        SelfActionForbiddenError,
      );
      await expect(service.softDelete("u1", { actorId: "u1" })).rejects.toBeInstanceOf(
        SelfActionForbiddenError,
      );
    });
  });
});
