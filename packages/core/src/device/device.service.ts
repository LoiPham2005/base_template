import type { PrismaClient } from "@repo/db";
import type { RegisterDeviceInput } from "@repo/contracts";

/**
 * Thiết bị nhận push của người dùng.
 *
 * ---
 * VÌ SAO `upsert` THEO `(userId, fcmToken)`
 *
 * FCM token đổi khi người dùng cài lại app, xoá dữ liệu, hoặc đơn giản là sau
 * một thời gian. Nếu chèn mới mỗi lần mở app thì một người dùng lâu năm tích
 * hàng trăm dòng, và mỗi lần gửi push là gửi tới hàng trăm token chết — Firebase
 * tính đó là tín hiệu xấu và hạ uy tín gửi của bạn.
 */
export class DeviceService {
  constructor(private readonly db: PrismaClient) {}

  async register(userId: string, input: RegisterDeviceInput) {
    return this.db.userDevice.upsert({
      where: { userId_fcmToken: { userId, fcmToken: input.fcmToken } },
      create: {
        userId,
        platform: input.platform,
        fcmToken: input.fcmToken,
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
      },
      update: {
        platform: input.platform,
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      select: { id: true, platform: true, deviceName: true, lastSeenAt: true },
    });
  }

  async listActive(userId: string) {
    return this.db.userDevice.findMany({
      where: { userId, isActive: true },
      select: { id: true, platform: true, deviceName: true, lastSeenAt: true, createdAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  /** Gọi khi đăng xuất: token còn đó nhưng không nên nhận push nữa. */
  async deactivate(userId: string, fcmToken: string): Promise<void> {
    await this.db.userDevice.updateMany({
      where: { userId, fcmToken },
      data: { isActive: false },
    });
  }

  /**
   * Token FCM của một danh sách người dùng — dùng khi gửi push.
   *
   * Chỉ lấy thiết bị đang hoạt động: gửi tới token đã tắt là tiêu băng thông
   * cho một thứ chắc chắn thất bại.
   */
  async tokensFor(userIds: string[]): Promise<string[]> {
    const rows = await this.db.userDevice.findMany({
      where: { userId: { in: userIds }, isActive: true },
      select: { fcmToken: true },
    });
    return rows.map((row) => row.fcmToken);
  }

  /**
   * Gỡ thiết bị không hoạt động quá lâu.
   *
   * FCM từ chối token quá cũ, và giữ chúng lại chỉ làm chậm mọi lần gửi.
   */
  async purgeStale(days = 180): Promise<number> {
    const result = await this.db.userDevice.deleteMany({
      where: { lastSeenAt: { lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
    });
    return result.count;
  }
}
