import { createServer, type Server as HttpServer } from "node:http";
import { Queue, Worker, type Job } from "bullmq";
import { QUEUE_NAME, env as coreEnv, jobHandlers, logger, type JobName } from "@repo/core";
import { workerEnv } from "./env";

/**
 * Tiến trình chạy job nền — RIÊNG với API.
 *
 * ---
 * VÌ SAO PHẢI LÀ TIẾN TRÌNH RIÊNG
 *
 * Ba lý do, xếp theo mức quan trọng:
 *
 * 1. **Deploy API không được giết job đang chạy.** Chạy chung tiến trình thì
 *    mỗi lần restart API là một job đang xử lý dở bị cắt ngang.
 * 2. **Job nặng không được làm chậm request.** Xuất một file Excel 50MB mà
 *    chung tiến trình với API thì mọi người dùng khác đều cảm nhận được.
 * 3. **Scale độc lập.** API cần nhiều instance vì nhiều request; worker cần
 *    nhiều instance vì nhiều job. Hai con số đó không liên quan gì tới nhau.
 *
 * ---
 * NHIỀU WORKER CÙNG LÚC THÌ SAO
 *
 * An toàn. BullMQ dùng Redis để khoá job: một job chỉ được giao cho đúng một
 * worker. Chạy 3 instance là xử lý nhanh gấp 3, không phải chạy trùng 3 lần.
 */

export type WorkerHandle = { stop: () => Promise<void> };

/**
 * `/health` trả kèm SỐ JOB trong hàng đợi.
 *
 * Đây là phần đáng giá nhất: nó biến việc "xem hàng đợi có ùn không" từ chuyện
 * phải SSH vào gõ `redis-cli` thành một lệnh `curl`. Job hỏng mà không ai nhìn
 * thấy là job không tồn tại.
 */
function startHealthServer(queue: Queue): HttpServer {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }

    void queue
      .getJobCounts("waiting", "active", "delayed", "failed")
      .then((counts) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok", counts }));
      })
      .catch(() => {
        // Không đếm được job nghĩa là mất kết nối Redis — worker vẫn "chạy"
        // nhưng không làm được việc gì. Phải trả 503 để trình quản lý tiến
        // trình xoay vòng nó, thay vì để nó ngồi im và trông như đang khoẻ.
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "error", queue: "unreachable" }));
      });
  });

  server.listen(workerEnv.WORKER_HEALTH_PORT, "0.0.0.0");
  return server;
}

export function startWorker(redisUrl: string): WorkerHandle {
  const connection = { url: redisUrl };

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const name = job.name as JobName;

      /*
       * Ép kiểu handler về `(payload: unknown) => Promise<void>`.
       *
       * Cần thiết vì `name` ở đây là HỢP của mọi tên job (nó đến từ Redis dưới
       * dạng chuỗi), nên `jobHandlers[name]` có kiểu tham số là GIAO của mọi
       * payload — một kiểu không giá trị nào thoả mãn. TypeScript không thu hẹp
       * được vì `name` và `job.data` là hai giá trị độc lập với nhau.
       *
       * An toàn ở tầng chạy: `JobPayloads` đã ràng buộc bên ĐẨY job (`enqueue`
       * là hàm generic), nên payload sai kiểu bị chặn ngay lúc biên dịch ở phía
       * gọi — chỗ duy nhất kiểm được thật.
       */
      const handler = jobHandlers[name] as ((payload: unknown) => Promise<void>) | undefined;

      if (!handler) {
        // Job lạ = worker cũ hơn API đang chạy. Ném lỗi để BullMQ giữ job lại
        // trong danh sách thất bại thay vì coi như đã xong — nhờ vậy sau khi
        // deploy worker mới, job vẫn còn để chạy lại.
        throw new Error(`Không có handler cho job "${name}" — worker cũ hơn API?`);
      }

      const startedAt = Date.now();
      await handler(job.data);

      logger.info("Job xong", {
        name,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        durationMs: Date.now() - startedAt,
      });
    },
    { connection, concurrency: workerEnv.WORKER_CONCURRENCY },
  );

  // Job thất bại là thứ PHẢI thấy được. Không có listener này thì lần thử cuối
  // cùng thất bại rơi vào im lặng, và bạn chỉ phát hiện khi có người hỏi vì sao
  // không nhận được email.
  worker.on("failed", (job, error) => {
    const isFinalAttempt = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    const context = { name: job?.name, jobId: job?.id, attempt: job?.attemptsMade };

    // Tách hai nhánh thay vì `logger[cond]`: `warn` nhận (message, context) còn
    // `error` nhận (message, error, context) — hai chữ ký khác nhau.
    if (isFinalAttempt) {
      logger.error("Job thất bại HẲN, không thử lại nữa", error, context);
    } else {
      logger.warn("Job thất bại, sẽ thử lại", { ...context, message: error.message });
    }
  });

  // Lỗi ở tầng kết nối (Redis rớt), không thuộc job nào. Không nghe thì nó
  // thành unhandled error và giết tiến trình.
  worker.on("error", (error) => {
    logger.error("Worker lỗi", error);
  });

  const queue = new Queue(QUEUE_NAME, { connection });

  /*
   * Job định kỳ dọn token hết hạn.
   *
   * Đăng ký ở ĐÂY chứ không dùng cron của hệ điều hành: cron của OS chạy trên
   * MỘT máy, nên nhân bản worker là job chạy trùng — hoặc tệ hơn, máy đó chết
   * và không ai biết job đã ngừng chạy từ tuần trước. BullMQ giữ lịch trong
   * Redis nên chỉ đúng một worker nhận được mỗi lần đến hạn.
   *
   * `jobId` cố định để đăng ký lại nhiều lần (mỗi lần khởi động) không tạo ra
   * nhiều lịch chồng lên nhau.
   */
  void queue
    .add(
      "maintenance:purge-expired",
      {},
      { repeat: { pattern: workerEnv.PURGE_CRON }, jobId: "purge-expired" },
    )
    .catch((error: unknown) => {
      logger.error("Không đăng ký được job dọn dẹp định kỳ", error);
    });

  const healthServer = startHealthServer(queue);

  logger.info("Worker đã chạy", {
    concurrency: workerEnv.WORKER_CONCURRENCY,
    healthPort: workerEnv.WORKER_HEALTH_PORT,
    purgeCron: workerEnv.PURGE_CRON,
    queueEnabled: coreEnv.QUEUE_ENABLED,
  });

  return {
    stop: async () => {
      // Đóng health server TRƯỚC: trình quản lý tiến trình lập tức thấy worker
      // không còn nhận request, thay vì thấy nó vẫn "khoẻ" trong lúc đang tắt.
      healthServer.close();
      // `close()` ĐỢI các job đang chạy hoàn tất — xem xử lý SIGTERM ở main.ts.
      await worker.close();
      await queue.close();
    },
  };
}
