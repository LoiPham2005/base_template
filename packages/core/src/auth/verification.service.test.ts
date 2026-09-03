import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@repo/db";
import { VerificationService } from "./verification.service";

function createDb(record: unknown, claimedCount = 1) {
  return {
    $transaction: vi.fn().mockResolvedValue([]),
    verificationToken: {
      findUnique: vi.fn().mockResolvedValue(record),
      updateMany: vi.fn().mockResolvedValue({ count: claimedCount }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
    },
  } as unknown as PrismaClient;
}

const valid = (extra: Record<string, unknown> = {}) => ({
  id: "vt-1",
  userId: "u1",
  type: "PASSWORD_RESET",
  usedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  ...extra,
});

describe("VerificationService", () => {
  it("cấp token mới thì XOÁ token cũ cùng loại, trong một transaction", async () => {
    // Bấm "gửi lại" ba lần thì chỉ link cuối cùng còn hiệu lực.
    const db = createDb(null);

    await new VerificationService(db).issue("u1", "PASSWORD_RESET");

    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", type: "PASSWORD_RESET", usedAt: null },
    });
  });

  it("OTP điện thoại là 6 chữ số, token qua email thì dài và ngẫu nhiên", async () => {
    const service = new VerificationService(createDb(null));

    const otp = await service.issue("u1", "PHONE_OTP");
    const link = await service.issue("u1", "PASSWORD_RESET");

    expect(otp.token).toMatch(/^\d{6}$/);
    expect(link.token.length).toBeGreaterThan(30);
  });

  it("đổi token hợp lệ lấy userId", async () => {
    const service = new VerificationService(createDb(valid()));

    await expect(service.consume("token", "PASSWORD_RESET")).resolves.toBe("u1");
  });

  it("từ chối token SAI LOẠI", async () => {
    // Không có chốt này thì một link xác thực email dùng được để đặt lại mật khẩu.
    const service = new VerificationService(createDb(valid({ type: "EMAIL_VERIFICATION" })));

    await expect(service.consume("token", "PASSWORD_RESET")).resolves.toBeNull();
  });

  it("từ chối token đã dùng và token hết hạn", async () => {
    const used = new VerificationService(createDb(valid({ usedAt: new Date() })));
    const expired = new VerificationService(
      createDb(valid({ expiresAt: new Date(Date.now() - 1) })),
    );

    await expect(used.consume("t", "PASSWORD_RESET")).resolves.toBeNull();
    await expect(expired.consume("t", "PASSWORD_RESET")).resolves.toBeNull();
  });

  it("hai request song song: chỉ một request giành được token", async () => {
    // `updateMany` với điều kiện `usedAt: null` trả 0 dòng nghĩa là request kia
    // vừa giành trước. Đọc-rồi-ghi thay vì làm thế này là token dùng được hai lần.
    const db = createDb(valid(), 0);

    await expect(new VerificationService(db).consume("t", "PASSWORD_RESET")).resolves.toBeNull();
  });
});
