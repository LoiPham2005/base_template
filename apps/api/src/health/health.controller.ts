import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { core } from "@repo/core";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Kiểm tra sức khỏe hệ thống (Database & API)" })
  async check() {
    const isDbHealthy = await core.health.pingDatabase();

    if (!isDbHealthy) {
      throw new ServiceUnavailableException({
        status: "error",
        database: "down",
      });
    }

    return {
      status: "ok",
      database: "up",
      timestamp: new Date().toISOString(),
    };
  }
}
