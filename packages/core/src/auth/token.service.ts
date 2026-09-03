import type { PrismaClient } from "@repo/db";
import { env } from "../config/env";
import { generateOpaqueToken, hashOpaqueToken } from "../common/opaque-token";
import { RefreshTokenReuseError } from "../common/errors";

/**
 * Vòng đời refresh token.
 *
 * Ba tính chất quan trọng, theo đúng thứ tự ưu tiên:
 *
 * 1. Database chỉ lưu SHA-256 của token. Rò database KHÔNG đồng nghĩa với rò
 *    phiên đăng nhập.
 * 2. Token XOAY VÒNG mỗi lần refresh — token cũ bị thu hồi ngay.
 * 3. Dùng lại một token đã bị thu hồi sẽ huỷ TOÀN BỘ phiên của tài khoản đó.
 *    Token đã xoay vòng mà còn được dùng lại chỉ có một cách giải thích hợp lý:
 *    nó đã bị đánh cắp. Lúc đó không thể biết bên nào là kẻ trộm, nên đá cả hai
 *    ra là phản ứng đúng.
 */

export type IssuedRefreshToken = {
  /** Chuỗi gốc — chỉ tồn tại trong response này, không lưu ở đâu cả. */
  token: string;
  expiresAt: Date;
  /**
   * Id của bản ghi refresh token. KHÔNG phải bí mật — biết id cũng không đăng
   * nhập được, vì token thật đã băm SHA-256 trước khi lưu.
   *
   * Trả nó về để client biết đâu là phiên của CHÍNH NÓ trong danh sách "thiết
   * bị đang đăng nhập": access token không mang thông tin gì về refresh token
   * đã sinh ra nó, nên không có id thì màn hình đó không tự nhận ra mình.
   */
  id: string;
};

export type ActiveSession = {
  id: string;
  /** Chuỗi User-Agent thô. Việc dịch sang "iPhone · Safari" để client lo. */
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export type RefreshContext = {
  userAgent?: string | null;
  ip?: string | null;
  deviceId?: string | null;
};

export class TokenService {
  constructor(private readonly db: PrismaClient) {}

  async issue(userId: string, context: RefreshContext = {}): Promise<IssuedRefreshToken> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.db.refreshToken.create({
      data: {
        tokenHash: hashOpaqueToken(token),
        userId,
        expiresAt,
        userAgent: context.userAgent ?? null,
        ip: context.ip ?? null,
        deviceId: context.deviceId ?? null,
      },
      select: { id: true },
    });

    return { token, expiresAt, id: created.id };
  }

  /**
   * Đổi refresh token lấy token mới.
   *
   * Trả `null` khi token không dùng được vì lý do thông thường (không tồn tại,
   * hết hạn) — nơi gọi chỉ cần biết "phải đăng nhập lại". NÉM lỗi riêng cho
   * trường hợp dùng lại token đã thu hồi, vì đó là dấu hiệu tấn công và cần
   * được ghi nhật ký khác hẳn.
   */
  async rotate(
    token: string,
    context: RefreshContext = {},
  ): Promise<{ userId: string; refresh: IssuedRefreshToken } | null> {
    const existing = await this.db.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        deviceId: true,
        user: { select: { status: true, deletedAt: true } },
      },
    });

    if (!existing) return null;

    if (existing.revokedAt) {
      await this.revokeAllForUser(existing.userId);
      throw new RefreshTokenReuseError(existing.userId);
    }

    if (existing.expiresAt <= new Date()) return null;

    // Token còn hạn nhưng chủ nhân đã bị khoá/xoá trong lúc đó. Không kiểm ở
    // đây thì tài khoản bị ban vẫn tự gia hạn phiên vô thời hạn.
    if (existing.user.deletedAt || existing.user.status === "BANNED") return null;

    await this.db.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const refresh = await this.issue(existing.userId, {
      ...context,
      // Giữ nguyên thiết bị của phiên cũ nếu lần refresh này không khai báo —
      // nếu không, mỗi lần refresh là phiên mất dấu thiết bị.
      deviceId: context.deviceId ?? existing.deviceId,
    });

    return { userId: existing.userId, refresh };
  }

  /** Đăng xuất một thiết bị. Token không tồn tại cũng coi là thành công. */
  async revoke(token: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Danh sách phiên còn hiệu lực.
   *
   * "Còn hiệu lực" = chưa thu hồi VÀ chưa hết hạn. Token đã xoay vòng vẫn nằm
   * trong bảng (có `revokedAt`) nhưng KHÔNG được hiện ra: mỗi lần refresh sinh
   * một dòng mới, nên hiện hết thì một chiếc điện thoại dùng một tháng sẽ xuất
   * hiện thành hàng trăm "thiết bị".
   */
  async listActive(userId: string): Promise<ActiveSession[]> {
    return this.db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Thu hồi MỘT phiên theo id — nút "đăng xuất thiết bị này".
   *
   * ⚠️ `userId` nằm trong điều kiện `where` chứ không phải một phép kiểm tra
   * riêng phía trên. Đây là điểm mấu chốt: id phiên đến từ client, nên không có
   * ràng buộc này thì bất kỳ ai cũng đăng xuất được thiết bị của người khác chỉ
   * bằng cách đoán id.
   *
   * Trả `false` khi không có gì bị thu hồi — id không tồn tại, thuộc người
   * khác, hoặc đã thu hồi rồi. Cố ý KHÔNG phân biệt ba trường hợp đó.
   */
  async revokeById(id: string, userId: string): Promise<boolean> {
    const result = await this.db.refreshToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }

  /** Đăng xuất mọi thiết bị. Dùng khi đổi mật khẩu hoặc phát hiện token bị dùng lại. */
  async revokeAllForUser(userId: string, options: { exceptId?: string } = {}): Promise<number> {
    const result = await this.db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.exceptId ? { NOT: { id: options.exceptId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Dọn token đã hết hạn. Gọi định kỳ bằng job nền — bảng này CHỈ TĂNG: mỗi
   * lần đăng nhập, mỗi lần refresh là thêm một dòng.
   */
  async purgeExpired(): Promise<number> {
    const result = await this.db.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          // Token đã thu hồi từ lâu cũng không còn giá trị điều tra.
          { revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    return result.count;
  }
}
