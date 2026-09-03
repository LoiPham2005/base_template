import { prisma } from "@repo/db";
import { closeRedis, env as coreEnv, logger } from "@repo/core";
import { startWorker } from "./worker";

/**
 * Entry của tiến trình worker.
 *
 * Tách khỏi `worker.ts` để test gọi được `startWorker()` rồi tự dừng, thay vì
 * import một file là nó tự chạy và không tắt được.
 *
 * ---
 * ⚠️ ĐÂY LÀ NƠI DUY NHẤT NGOÀI `packages/core` ĐƯỢC IMPORT `@repo/db`
 *
 * Và chỉ để `$disconnect()` lúc tắt. Mọi truy vấn vẫn đi qua service của core.
 */
function main() {
  /*
   * Chốt chặn cho cấu hình tự mâu thuẫn.
   *
   * `QUEUE_ENABLED=0` mà worker vẫn được dựng: lúc đó `enqueue()` chạy job
   * thẳng trong request, còn tiến trình này ngồi chờ một hàng đợi không bao giờ
   * có gì — tốn RAM và, tệ hơn, trông y như đang hoạt động bình thường.
   */
  if (!coreEnv.QUEUE_ENABLED) {
    logger.warn(
      "QUEUE_ENABLED=0 — hàng đợi đã tắt nên worker không có việc gì để làm. Thoát.\n" +
        "Nếu ngoài ý muốn: đặt QUEUE_ENABLED=1 rồi dựng lại.\n" +
        "Nếu đúng ý: gỡ tiến trình này khỏi cấu hình deploy — `docker compose up -d` " +
        "tự gỡ container vì replicas đọc chính biến này.",
    );
    process.exit(0);
  }

  if (!coreEnv.REDIS_URL) {
    // Khác hẳn nhánh trên: đây là cấu hình THIẾU, không phải lựa chọn. Worker
    // không có Redis thì không có hàng đợi nào để lắng nghe.
    logger.error(
      "Thiếu REDIS_URL — worker không chạy được. Đặt REDIS_URL, hoặc đặt QUEUE_ENABLED=0 " +
        "để job chạy thẳng trong request và không cần tiến trình này.",
    );
    process.exit(1);
  }

  const worker = startWorker(coreEnv.REDIS_URL);

  const shutdown = () => {
    logger.info("Đang tắt worker…");

    /*
     * `stop()` ĐỢI job đang chạy dở hoàn tất. Đây là điểm quan trọng nhất của
     * việc tắt gọn gàng: cắt ngang một job đã trừ tiền nhưng chưa ghi nhận là
     * để lại dữ liệu sai. Job chưa bắt đầu vẫn nằm nguyên trong Redis, một
     * worker khác sẽ nhận.
     *
     * ⚠️ Trình quản lý tiến trình phải cho đủ thời gian: mặc định Docker chỉ
     * đợi 10 giây sau SIGTERM rồi SIGKILL. Job dài hơn thế thì nâng
     * `stop_grace_period` trong compose.
     */
    worker
      .stop()
      .then(() => closeRedis())
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error("Tắt worker không sạch", error);
        process.exit(1);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

try {
  main();
} catch (error: unknown) {
  logger.error("Worker không khởi động được", error);
  process.exit(1);
}
