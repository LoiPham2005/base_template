import { describe, expect, it } from "vitest";
import {
  generateNumericOtp,
  generateOpaqueToken,
  hashOpaqueToken,
  safeEqualHash,
} from "./opaque-token";

describe("opaque token", () => {
  it("mỗi lần sinh ra một giá trị khác nhau", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(200);
  });

  it("băm ổn định và không thể suy ngược ra token gốc", () => {
    const token = generateOpaqueToken();

    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toContain(token);
    // SHA-256 hex = 64 ký tự.
    expect(hashOpaqueToken(token)).toHaveLength(64);
  });

  it("OTP luôn đủ số chữ số, kể cả khi giá trị bắt đầu bằng 0", () => {
    for (let i = 0; i < 300; i += 1) {
      const otp = generateNumericOtp(6);
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it("safeEqualHash trả false thay vì ném lỗi khi độ dài khác nhau", () => {
    // `timingSafeEqual` của Node ném lỗi khi độ dài lệch — mà chính việc ném
    // lỗi đó đã làm lộ thông tin.
    expect(safeEqualHash("abc", "abcdef")).toBe(false);
    expect(safeEqualHash("giong-nhau", "giong-nhau")).toBe(true);
  });
});
