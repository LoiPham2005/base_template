import type { PrismaClient } from "@repo/db";
import { env } from "../config/env";
import { getRedis } from "../infra/redis";
import { getQueueCounts, isQueueEnabled } from "../infra/queue";
import { isMailerConfigured } from "../infra/mailer";
import { isStorageConfigured } from "../infra/storage";

export type ComponentStatus = "ok" | "degraded" | "down" | "disabled";

export type HealthReport = {
  status: ComponentStatus;
  uptimeSeconds: number;
  timestamp: string;
  components: Record<string, { status: ComponentStatus; detail?: string; latencyMs?: number }>;
};

/**
 * Health check dùng cho load balancer, Docker và giám sát.
 *
 * ---
 * PHÂN BIỆT "CHƯA BẬT" VỚI "ĐÃ BẬT MÀ CHẾT"
 *
 * Đây là điểm quan trọng nhất của file này. Một hệ thống không dùng Redis thì
 * "không có Redis" là trạng thái ĐÚNG, không phải sự cố. Trộn hai thứ đó lại
 * thì hoặc báo động giả suốt ngày (và người ta tắt cảnh báo đi), hoặc bỏ qua
 * lỗi thật.
 *
 * Vì vậy `disabled` là một trạng thái riêng, và nó KHÔNG kéo trạng thái tổng
 * xuống.
 */
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(private readonly db: PrismaClient) {}

  /** Kiểm tra nhẹ, dùng cho `/health` — chỉ trả lời "tiến trình còn sống không". */
  liveness() {
    return {
      status: "ok" as const,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Kiểm tra đầy đủ, dùng cho `/health/ready`.
   *
   * Load balancer nên gọi endpoint NÀY để quyết định có gửi request vào không:
   * một instance mất kết nối database vẫn trả lời được `/health` nhưng không
   * phục vụ được request nào.
   */
  async readiness(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const components: HealthReport["components"] = {
      database,
      redis,
      queue: await this.checkQueue(),
      mailer: {
        status: isMailerConfigured() ? "ok" : "disabled",
        detail: isMailerConfigured() ? undefined : "chưa cấu hình SMTP — email chỉ ghi ra log",
      },
      storage: {
        status: isStorageConfigured() ? "ok" : "disabled",
        detail: isStorageConfigured() ? undefined : "chưa cấu hình S3",
      },
    };

    // `disabled` KHÔNG kéo trạng thái tổng xuống — xem ghi chú đầu class.
    const hasDown = Object.values(components).some((item) => item.status === "down");
    const hasDegraded = Object.values(components).some((item) => item.status === "degraded");

    return {
      status: hasDown ? "down" : hasDegraded ? "degraded" : "ok",
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      components,
    };
  }

  private async checkDatabase() {
    const startedAt = Date.now();
    try {
      // `SELECT 1` chứ không phải một truy vấn thật: chỉ cần biết kết nối còn
      // sống, và một health check chạy vài giây một lần không nên đụng vào dữ
      // liệu nghiệp vụ.
      await this.db.$queryRaw`SELECT 1`;
      return { status: "ok" as const, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: "down" as const,
        detail: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async checkRedis() {
    const client = getRedis();
    if (!client) {
      return { status: "disabled" as const, detail: "chưa đặt REDIS_URL" };
    }

    const startedAt = Date.now();
    try {
      await (await client).ping();
      return { status: "ok" as const, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: "down" as const,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkQueue() {
    if (!env.QUEUE_ENABLED) {
      return {
        status: "disabled" as const,
        detail: "QUEUE_ENABLED=0 — job chạy thẳng trong request",
      };
    }

    if (!isQueueEnabled()) {
      // Cờ bật nhưng thiếu Redis: đây là cấu hình SAI, không phải lựa chọn.
      return { status: "degraded" as const, detail: "QUEUE_ENABLED=1 nhưng thiếu REDIS_URL" };
    }

    try {
      const counts = await getQueueCounts();
      return {
        status: "ok" as const,
        detail: counts
          ? `waiting=${counts.waiting} active=${counts.active} failed=${counts.failed}`
          : undefined,
      };
    } catch (error) {
      return {
        status: "down" as const,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
