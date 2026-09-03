import type { PrismaClient, VerificationTokenType } from "@repo/db";
import { env } from "../config/env";
import { generateNumericOtp, generateOpaqueToken, hashOpaqueToken } from "../common/opaque-token";

/**
 * Vòng đời token dùng MỘT LẦN gửi qua email/SMS.
 *
 * Bốn tính chất, theo thứ tự quan trọng:
 *
 * 1. Database chỉ lưu SHA-256. Rò database không đồng nghĩa với chiếm được tài
 *    khoản.
 * 2. Dùng một lần THẬT SỰ — đánh dấu bằng thao tác nguyên tử, nên hai request
 *    đồng thời với cùng một token chỉ một cái thành công.
 * 3. Cấp token mới thì token cũ CÙNG LOẠI bị xoá. Người dùng bấm "gửi lại" ba
 *    lần thì chỉ link cuối cùng còn hiệu lực.
 * 4. Hạn ngắn, khác nhau theo loại (xem `ttlFor`).
 */

export type IssuedVerificationToken = {
  /** Chuỗi gốc — chỉ tồn tại trong lần gọi này, không lưu ở đâu cả. */
  token: string;
  expiresAt: Date;
};

function ttlMsFor(type: VerificationTokenType): number {
  switch (type) {
    case "EMAIL_VERIFICATION":
      return env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;
    case "PASSWORD_RESET":
      return env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
    case "PHONE_OTP":
      return env.PHONE_OTP_TTL_MINUTES * 60 * 1000;
  }
}

export class VerificationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Cấp token mới, đồng thời huỷ mọi token cũ cùng loại của user.
   *
   * Xoá hẳn thay vì đánh dấu: chúng chưa từng được dùng nên đánh dấu `usedAt`
   * là ghi sai sự thật, mà giữ lại cũng không phục vụ mục đích kiểm toán nào.
   *
   * Gói trong transaction để không có khoảnh khắc nào mà token cũ đã bị xoá còn
   * token mới chưa kịp ghi.
   */
  async issue(userId: string, type: VerificationTokenType): Promise<IssuedVerificationToken> {
    // OTP qua SMS phải gõ tay nên chỉ có 6 chữ số; token trong link thì dài và
    // ngẫu nhiên hoàn toàn. Entropy thấp của OTP được bù bằng hạn rất ngắn
    // (PHONE_OTP_TTL_MINUTES) — đó là lý do hai loại không dùng chung bộ sinh.
    const token = type === "PHONE_OTP" ? generateNumericOtp() : generateOpaqueToken();
    const expiresAt = new Date(Date.now() + ttlMsFor(type));

    await this.db.$transaction([
      this.db.verificationToken.deleteMany({ where: { userId, type, usedAt: null } }),
      this.db.verificationToken.create({
        data: { tokenHash: hashOpaqueToken(token), type, userId, expiresAt },
      }),
    ]);

    return { token, expiresAt };
  }

  /**
   * Đổi token lấy `userId`, và đánh dấu token đã dùng.
   *
   * Trả `null` cho MỌI lý do thất bại — không tồn tại, sai loại, đã dùng, hết
   * hạn. Nơi gọi không cần phân biệt, và cũng KHÔNG NÊN nói cho người dùng biết
   * lý do cụ thể: "token này đã được dùng" xác nhận rằng token đó từng hợp lệ.
   *
   * Phép đánh dấu dùng `updateMany` với điều kiện `usedAt: null` rồi kiểm số
   * dòng bị ảnh hưởng. Đây là điểm mấu chốt: nếu đọc trước rồi ghi sau, hai
   * request song song đều thấy `usedAt` null và cùng đi tiếp — token dùng được
   * hai lần. Ràng buộc nằm trong chính câu lệnh ghi thì database phân xử.
   */
  async consume(token: string, type: VerificationTokenType): Promise<string | null> {
    const record = await this.db.verificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });

    if (!record) return null;
    if (record.type !== type) return null;
    if (record.usedAt) return null;
    if (record.expiresAt <= new Date()) return null;

    const claimed = await this.db.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // 0 dòng nghĩa là một request khác vừa giành được token trước.
    if (claimed.count !== 1) return null;

    return record.userId;
  }

  /**
   * Dọn token đã hết hạn hoặc đã dùng.
   *
   * Bảng này CHỈ TĂNG: mỗi lần bấm "quên mật khẩu" là thêm một dòng, kể cả khi
   * người dùng không bao giờ mở email.
   */
  async purgeExpired(): Promise<number> {
    const result = await this.db.verificationToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
    });
    return result.count;
  }
}
