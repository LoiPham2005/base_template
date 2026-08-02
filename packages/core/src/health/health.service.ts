import type { PrismaClient } from "@repo/db";

export class HealthService {
  constructor(private readonly db: PrismaClient) {}

  async pingDatabase(): Promise<boolean> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
