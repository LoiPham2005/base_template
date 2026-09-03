import { Controller, Get, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { HealthService } from "@repo/core";
import { Public } from "../common/decorators/public.decorator";

/**
 * Hai endpoint cho hai câu hỏi KHÁC NHAU:
 *
 *   /health       — "tiến trình còn sống không?" Dùng cho liveness probe.
 *                   Phải nhẹ và luôn trả 200 khi tiến trình chưa treo, nếu
 *                   không thì database chậm một chút là Kubernetes khởi động
 *                   lại container — đúng lúc đang tải cao.
 *
 *   /health/ready — "có phục vụ được request không?" Dùng cho load balancer.
 *                   Kiểm database, Redis, hàng đợi. Trả 503 khi có thành phần
 *                   `down`, để LB rút instance này ra khỏi vòng quay thay vì
 *                   tiếp tục gửi request vào một chỗ chắc chắn lỗi.
 */
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness — tiến trình còn sống" })
  liveness() {
    return this.health.liveness();
  }

  @Public()
  @Get("ready")
  @ApiOperation({ summary: "Readiness — kiểm tra database, Redis, hàng đợi" })
  async readiness(@Res({ passthrough: true }) reply: FastifyReply) {
    const report = await this.health.readiness();

    // `degraded` VẪN trả 200: hàng đợi lỗi thì instance này vẫn phục vụ được
    // request đọc/ghi bình thường. Rút nó ra khỏi LB lúc đó là tự làm giảm năng
    // lực phục vụ mà không giải quyết được gì.
    if (report.status === "down") reply.status(503);

    return report;
  }
}
