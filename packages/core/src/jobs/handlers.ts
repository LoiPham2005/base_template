import { prisma } from "@repo/db";
import { logger } from "../common/logger";
import { getMailer } from "../infra/mailer";
import { TokenService } from "../auth/token.service";
import { VerificationService } from "../auth/verification.service";
import type { JobHandlers } from "./types";

/**
 * Nơi job thật sự được xử lý.
 *
 * Cùng một object được dùng ở HAI chỗ: `apps/worker` (đường đi thật) và
 * `infra/queue.ts` khi hàng đợi bị tắt (chạy thẳng trong request). Một bản cài
 * đặt duy nhất nghĩa là hai chế độ không thể lệch hành vi.
 *
 * ---
 * HANDLER PHẢI CHẠY LẠI ĐƯỢC MÀ KHÔNG GÂY HẠI (idempotent)
 *
 * BullMQ thử lại khi thất bại, và một job có thể chạy hai lần nếu worker chết
 * đúng lúc vừa xong việc nhưng chưa kịp báo. Handler nào có tác dụng phụ không
 * chịu được lặp (trừ tiền, gửi tin nhắn tính phí) thì phải tự chốt bằng một
 * khoá trong database.
 */
export const jobHandlers: JobHandlers = {
  async "email:send"(payload) {
    await getMailer().send(payload);
    logger.info("Đã gửi email", { to: payload.to, subject: payload.subject });
  },

  async "push:send"(payload) {
    const devices = await prisma.userDevice.findMany({
      where: { userId: { in: payload.userIds }, isActive: true },
      select: { fcmToken: true },
    });

    if (devices.length === 0) {
      logger.debug("Không có thiết bị nào để đẩy push", { notificationId: payload.notificationId });
      return;
    }

    /*
     * ĐIỂM CẮM FIREBASE.
     *
     * Cố ý chưa cài sẵn `firebase-admin`: nó cần service account riêng của từng
     * dự án, và là một dependency nặng mà phần lớn dự án web không dùng. Khi
     * cần, cài `firebase-admin` rồi thay khối này bằng:
     *
     *   await getMessaging().sendEachForMulticast({
     *     tokens, notification: { title, body }, data,
     *   });
     *
     * Nhớ xoá token bị Firebase trả về `UNREGISTERED` — xem `DeviceService`.
     */
    logger.info("Push (chưa cắm Firebase — mới ghi log)", {
      notificationId: payload.notificationId,
      deviceCount: devices.length,
    });

    await prisma.notificationRecipient.updateMany({
      where: { notificationId: payload.notificationId, userId: { in: payload.userIds } },
      data: { isPushed: true, pushedAt: new Date() },
    });
  },

  async "maintenance:purge-expired"() {
    const tokens = new TokenService(prisma);
    const verification = new VerificationService(prisma);

    const [refreshTokens, verificationTokens] = await Promise.all([
      tokens.purgeExpired(),
      verification.purgeExpired(),
    ]);

    logger.info("Đã dọn token hết hạn", { refreshTokens, verificationTokens });
  },
};
