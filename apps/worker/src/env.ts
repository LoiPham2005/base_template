import { z } from "zod";
import { loadEnvFiles } from "@repo/core";

loadEnvFiles();

/**
 * Biến môi trường RIÊNG của tiến trình worker.
 *
 * Phần dùng chung (DATABASE_URL, REDIS_URL, SMTP…) do `@repo/core` validate.
 * Ở đây chỉ còn những gì mà một tiến trình chạy job mới cần.
 */
const workerEnvSchema = z.object({
  /**
   * Số job chạy song song trong MỘT tiến trình worker.
   *
   * Đừng đẩy lên cao chỉ vì "cho nhanh": mỗi job đang chạy chiếm một kết nối
   * database, và pool mặc định của Prisma chỉ có `num_cpus * 2 + 1`. Vượt qua
   * đó thì job không chạy nhanh hơn — chúng xếp hàng chờ kết nối, và bạn nhận
   * được lỗi timeout thay vì thông lượng.
   *
   * Cần nhiều hơn thì chạy THÊM instance worker: BullMQ khoá job qua Redis nên
   * một job chỉ được giao cho đúng một worker.
   */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(100).default(5),

  /**
   * Cổng của endpoint `/health`.
   *
   * Worker không phục vụ request nghiệp vụ, nên không có gì để ping. Thiếu
   * endpoint này thì Docker, systemd và PM2 đều chỉ biết "tiến trình còn tồn
   * tại" — một worker treo vì mất kết nối Redis vẫn được coi là khoẻ.
   */
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().max(65535).default(3002),

  /**
   * Giờ chạy job dọn dẹp hằng ngày, theo cron 5 trường.
   *
   * Mặc định 3 giờ sáng: giờ thấp điểm ở Việt Nam, và `DELETE` trên bảng token
   * lớn có thể khoá dòng một lúc.
   */
  PURGE_CRON: z.string().default("0 3 * * *"),
});

function load() {
  const parsed = workerEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Cấu hình worker không hợp lệ:\n${details}`);
  }

  return parsed.data;
}

export const workerEnv = load();
