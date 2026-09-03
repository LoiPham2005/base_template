import { describe, expect, it } from "vitest";
import { CryptoUtils } from "./crypto";

describe("CryptoUtils", () => {
  it("băm rồi kiểm tra lại được chính mật khẩu đó", async () => {
    const hash = await CryptoUtils.hashPassword("matkhau-rat-dai-123");

    await expect(CryptoUtils.verifyPassword("matkhau-rat-dai-123", hash)).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
  });

  it("từ chối mật khẩu sai", async () => {
    const hash = await CryptoUtils.hashPassword("dung");
    const check = await CryptoUtils.verifyPassword("sai", hash);

    expect(check.valid).toBe(false);
  });

  it("hai lần băm cùng một mật khẩu cho ra hai chuỗi khác nhau", async () => {
    // Salt ngẫu nhiên. Nếu hai chuỗi giống nhau nghĩa là salt đang cố định — và
    // lúc đó một bảng tra sẵn phá được toàn bộ kho mật khẩu cùng lúc.
    const a = await CryptoUtils.hashPassword("cung-mot-mat-khau");
    const b = await CryptoUtils.hashPassword("cung-mot-mat-khau");

    expect(a).not.toBe(b);
  });

  it("nhận diện hash bcrypt cũ và yêu cầu băm lại", async () => {
    // Hash bcrypt thật của chuỗi "password", sinh sẵn để test không phụ thuộc
    // vào việc còn cài được thư viện băm bcrypt hay không.
    const bcryptHash = "$2b$10$mfOSMFAGI5rmd4CXWS5m5OG/.CdQ6RzFezGMk0HTrnqnYZDRwKyz.";

    const check = await CryptoUtils.verifyPassword("password", bcryptHash);

    expect(check.valid).toBe(true);
    // Đây là cơ chế chuyển dần sang Argon2id mà không bắt ai đổi mật khẩu.
    expect(check.needsRehash).toBe(true);
  });

  it("hash rác trả về 'sai mật khẩu' thay vì ném lỗi", async () => {
    // Một dòng dữ liệu hỏng trong database phải dẫn tới đăng nhập thất bại,
    // KHÔNG phải lỗi 500 — vốn làm lộ ra rằng bản ghi đó có vấn đề.
    await expect(CryptoUtils.verifyPassword("bat-ky", "day-khong-phai-hash")).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("fakeCompare không ném lỗi và tốn thời gian tương đương", async () => {
    // Không có nó, "email không tồn tại" trả về nhanh hơn hẳn "sai mật khẩu",
    // và đo thời gian phản hồi là dò ra được email nào đã đăng ký.
    const startedAt = Date.now();
    await CryptoUtils.fakeCompare("bat-ky");

    expect(Date.now() - startedAt).toBeGreaterThan(5);
  });
});
