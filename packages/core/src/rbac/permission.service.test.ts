import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@repo/db";
import { PermissionService } from "./permission.service";
import { __clearCache } from "../infra/cache";

/**
 * Không cần database thật: chỉ giả lập đúng một truy vấn mà service gọi.
 *
 * Kiểu `PrismaClient` được ép ở biên — bên trong test ta chỉ khai những field
 * thực sự được đọc, thay vì dựng một bản sao đầy đủ của Prisma.
 */
function createDb(user: unknown) {
  return {
    user: { findFirst: vi.fn().mockResolvedValue(user) },
  } as unknown as PrismaClient;
}

const roleWith = (...keys: string[]) => ({
  role: { permissions: keys.map((key) => ({ permission: { key } })) },
});

describe("PermissionService", () => {
  beforeEach(async () => {
    // Cache dùng chung giữa các test — không dọn thì test sau đọc kết quả của
    // test trước và pass/fail theo thứ tự chạy.
    await __clearCache();
  });

  it("gộp quyền từ NHIỀU vai trò", async () => {
    const db = createDb({
      userRoles: [roleWith("user:read"), roleWith("role:read", "audit:read")],
      userPermissions: [],
    });

    const permissions = await new PermissionService(db).permissionsFor("u1");

    expect([...permissions].sort()).toEqual(["audit:read", "role:read", "user:read"]);
  });

  it("quyền cấp riêng cho cá nhân được cộng thêm", async () => {
    const db = createDb({
      userRoles: [roleWith("user:read")],
      userPermissions: [{ isGranted: true, permission: { key: "user:delete" } }],
    });

    const service = new PermissionService(db);

    expect(await service.can("u1", "user:delete")).toBe(true);
  });

  it("TƯỚC quyền cá nhân thắng mọi vai trò", async () => {
    // Đây là luật quan trọng nhất của lớp này: cần chặn gấp một người khỏi một
    // hành động thì phải chặn được ngay, không phải đi dựng lại vai trò.
    const db = createDb({
      userRoles: [roleWith("user:read", "user:delete")],
      userPermissions: [{ isGranted: false, permission: { key: "user:delete" } }],
    });

    const service = new PermissionService(db);

    expect(await service.can("u1", "user:read")).toBe(true);
    expect(await service.can("u1", "user:delete")).toBe(false);
  });

  it("bỏ qua quyền không còn tồn tại trong code", async () => {
    // Một dòng cũ sót lại trong database không được phép cấp quyền, vì không
    // còn dòng mã nào kiểm tra nó.
    const db = createDb({
      userRoles: [roleWith("user:read", "quyen:da:bi:xoa")],
      userPermissions: [],
    });

    const permissions = await new PermissionService(db).permissionsFor("u1");

    expect([...permissions]).toEqual(["user:read"]);
  });

  it("người dùng không tồn tại có tập quyền rỗng, không ném lỗi", async () => {
    const service = new PermissionService(createDb(null));

    expect([...(await service.permissionsFor("khong-co"))]).toEqual([]);
    expect(await service.can("khong-co", "user:read")).toBe(false);
  });

  it("canAll cần đủ mọi quyền, canAny chỉ cần một", async () => {
    const db = createDb({ userRoles: [roleWith("user:read")], userPermissions: [] });
    const service = new PermissionService(db);

    expect(await service.canAny("u1", ["user:read", "user:delete"])).toBe(true);
    expect(await service.canAll("u1", ["user:read", "user:delete"])).toBe(false);
  });

  it("cache: lần gọi thứ hai không chạm database nữa", async () => {
    const db = createDb({ userRoles: [roleWith("user:read")], userPermissions: [] });
    const service = new PermissionService(db);

    await service.permissionsFor("u1");
    await service.permissionsFor("u1");

    expect(db.user.findFirst).toHaveBeenCalledTimes(1);
  });

  it("invalidateUser buộc lần sau đọc lại từ database", async () => {
    // Quên gọi hàm này sau khi đổi vai trò thì thay đổi chỉ có hiệu lực sau khi
    // TTL hết — người quản trị thử lại ngay, thấy chưa đổi, và tưởng hỏng.
    const db = createDb({ userRoles: [roleWith("user:read")], userPermissions: [] });
    const service = new PermissionService(db);

    await service.permissionsFor("u1");
    await service.invalidateUser("u1");
    await service.permissionsFor("u1");

    expect(db.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it("canActOnResource: quyền ':own' chỉ áp dụng cho dữ liệu của chính mình", async () => {
    const db = createDb({
      userRoles: [roleWith("profile:update:own")],
      userPermissions: [],
    });
    const service = new PermissionService(db);
    const rule = { any: "user:update", own: "profile:update:own" } as const;

    expect(await service.canActOnResource("u1", "u1", rule)).toBe(true);
    expect(await service.canActOnResource("u1", "nguoi-khac", rule)).toBe(false);
  });
});
