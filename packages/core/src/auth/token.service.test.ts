import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@repo/db";
import { TokenService } from "./token.service";
import { RefreshTokenReuseError } from "../common/errors";
import { hashOpaqueToken } from "../common/opaque-token";

function createDb(overrides: Record<string, unknown> = {}) {
  return {
    refreshToken: {
      create: vi.fn().mockResolvedValue({ id: "rt-moi" }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      ...overrides,
    },
  } as unknown as PrismaClient;
}

const activeToken = (extra: Record<string, unknown> = {}) => ({
  id: "rt-cu",
  userId: "u1",
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  deviceId: null,
  user: { status: "ACTIVE", deletedAt: null },
  ...extra,
});

describe("TokenService", () => {
  it("chỉ lưu SHA-256 của token, không lưu chuỗi gốc", async () => {
    // Rò database không được đồng nghĩa với rò phiên đăng nhập.
    const db = createDb();
    const issued = await new TokenService(db).issue("u1");

    const written = vi.mocked(db.refreshToken.create).mock.calls[0]![0]!.data;

    expect(written.tokenHash).toBe(hashOpaqueToken(issued.token));
    expect(JSON.stringify(written)).not.toContain(issued.token);
  });

  it("xoay vòng: token cũ bị thu hồi và token mới được cấp", async () => {
    const db = createDb({ findUnique: vi.fn().mockResolvedValue(activeToken()) });
    const service = new TokenService(db);

    const result = await service.rotate("token-cu");

    expect(result?.userId).toBe("u1");
    expect(db.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rt-cu" } }),
    );
    expect(db.refreshToken.create).toHaveBeenCalled();
  });

  it("dùng lại token ĐÃ THU HỒI thì huỷ toàn bộ phiên của tài khoản", async () => {
    // Token đã xoay vòng mà còn được dùng lại chỉ có một cách giải thích hợp
    // lý: nó đã bị đánh cắp. Không biết bên nào là kẻ trộm nên đá cả hai ra.
    const db = createDb({
      findUnique: vi.fn().mockResolvedValue(activeToken({ revokedAt: new Date() })),
    });
    const service = new TokenService(db);

    await expect(service.rotate("token-da-thu-hoi")).rejects.toBeInstanceOf(RefreshTokenReuseError);

    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("token hết hạn trả null (không phải lỗi bị đánh cắp)", async () => {
    const db = createDb({
      findUnique: vi.fn().mockResolvedValue(activeToken({ expiresAt: new Date(Date.now() - 1) })),
    });

    await expect(new TokenService(db).rotate("het-han")).resolves.toBeNull();
  });

  it("token không tồn tại trả null", async () => {
    await expect(new TokenService(createDb()).rotate("khong-co")).resolves.toBeNull();
  });

  it("tài khoản bị BANNED không refresh được dù token còn hạn", async () => {
    // Không có chốt này thì tài khoản vừa bị khoá vẫn tự gia hạn phiên vô thời hạn.
    const db = createDb({
      findUnique: vi
        .fn()
        .mockResolvedValue(activeToken({ user: { status: "BANNED", deletedAt: null } })),
    });

    await expect(new TokenService(db).rotate("token")).resolves.toBeNull();
  });

  it("revokeById ràng buộc userId ngay trong where", async () => {
    // Id phiên đến từ client. Thiếu ràng buộc này là ai cũng đăng xuất được
    // thiết bị của người khác chỉ bằng cách đoán id.
    const db = createDb({ updateMany: vi.fn().mockResolvedValue({ count: 1 }) });

    await new TokenService(db).revokeById("rt-1", "u1");

    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "rt-1", userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokeById trả false khi không thu hồi được gì", async () => {
    const db = createDb({ updateMany: vi.fn().mockResolvedValue({ count: 0 }) });

    await expect(new TokenService(db).revokeById("rt-cua-nguoi-khac", "u1")).resolves.toBe(false);
  });

  it("revokeAllForUser giữ lại được phiên hiện tại", async () => {
    // Đổi mật khẩu mà đăng xuất luôn thiết bị đang thao tác thì trông y như lỗi.
    const db = createDb();

    await new TokenService(db).revokeAllForUser("u1", { exceptId: "rt-hien-tai" });

    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null, NOT: { id: "rt-hien-tai" } },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
