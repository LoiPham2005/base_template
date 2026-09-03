import "reflect-metadata";
import { Logger, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { closeQueue, closeRedis, logger } from "@repo/core";
import { AppModule } from "./app.module";
import { env, isProduction } from "./env";

async function bootstrap() {
  const bootLogger = new Logger("Bootstrap");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      /*
       * BẮT BUỘC khi chạy sau reverse proxy (Caddy/nginx/Railway).
       *
       * Rate limit giới hạn theo IP. Không bật `trustProxy` thì Fastify lấy IP
       * của chính proxy cho MỌI request — tức là toàn bộ người dùng chung một
       * bộ đếm, và một người spam là khoá luôn tất cả những người còn lại.
       *
       * An toàn vì `Caddyfile` trong repo GHI ĐÈ `X-Forwarded-For` bằng
       * `{remote_host}` thay vì nối thêm — client không tự khai man IP được.
       * Nếu bạn đổi sang proxy khác, hãy kiểm tra lại điều đó.
       */
      trustProxy: true,

      // Xem ghi chú ở `BODY_LIMIT_BYTES` trong env.ts: API này nhận JSON, tệp
      // đi thẳng lên S3 bằng presigned URL.
      bodyLimit: env.BODY_LIMIT_BYTES,
    }),
    // Log của Nest bị tắt: `@repo/core` đã có logger JSON riêng, và hai định
    // dạng log trộn lẫn trong cùng một luồng thì công cụ nào cũng parse hỏng.
    // Lỗi khởi động vẫn hiện vì `Logger` được gọi tường minh bên dưới.
    { logger: isProduction ? ["error", "warn"] : ["error", "warn", "log"] },
  );

  await app.register(helmet, {
    // API trả JSON, không render HTML, nên CSP ở đây không có tác dụng gì.
    // Header CSP thuộc về phía web (apps/web).
    contentSecurityPolicy: false,
  });

  app.enableCors({
    // `*` chỉ tới được đây khi không phải production — env.ts chặn từ đầu.
    // Wildcard + credentials là cấu hình mâu thuẫn nên phải tắt credentials
    // cùng lúc, thay vì để trình duyệt âm thầm từ chối request.
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: env.CORS_ORIGIN !== "*",
    exposedHeaders: ["x-request-id", "RateLimit-Limit", "RateLimit-Remaining", "Retry-After"],
  });

  /*
   * Version nằm trong ĐƯỜNG DẪN: `/api/v1/...`
   *
   * Không dùng header vì URL là thứ dán được vào tài liệu, log và bug report —
   * còn một version ẩn trong header thì nhìn log không biết client gọi bản nào.
   *
   * Lên v2 thì THÊM `@Version("2")` cho những endpoint có thay đổi phá vỡ tương
   * thích, KHÔNG đổi tên v1: app đã lên store không ép cập nhật ngay được, nên
   * hai version phải chạy song song một thời gian.
   */
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  if (env.ENABLE_SWAGGER || !isProduction) {
    const config = new DocumentBuilder()
      .setTitle("Base Template API")
      .setDescription(
        "REST API dùng chung cho web, mobile và bên thứ ba.\n\n" +
          "Mọi response thành công có dạng `{ data: … }`; lỗi có dạng " +
          "`{ error: { code, message, fields? } }`. Client nên switch theo `code`, không theo `message`.",
      )
      .setVersion("1.0")
      .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
      .build();

    /*
     * `cleanupOpenApiDoc` là bắt buộc với nestjs-zod v5.
     *
     * `createZodDto` gắn schema Zod vào metadata dưới một dạng riêng; không đi
     * qua bước dọn này thì tài liệu sinh ra chứa các nhánh `$ref` treo lơ lửng
     * và Swagger UI hiển thị body rỗng cho mọi endpoint — tài liệu vẫn "có"
     * nhưng không nói được gì.
     */
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

    SwaggerModule.setup("docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    bootLogger.log(`Swagger: http://localhost:${env.PORT}/docs`);
  } else {
    // Nói rõ là đã TẮT CÓ CHỦ ĐÍCH. Không có dòng này thì mỗi lần ai đó mở
    // /docs trên production và thấy 404, câu hỏi đầu tiên là "hỏng ở đâu".
    bootLogger.log("Swagger đã tắt trên production (bật lại bằng ENABLE_SWAGGER=true)");
  }

  /*
   * Đóng kết nối trước khi thoát.
   *
   * `enableShutdownHooks` lo phần Nest + Prisma. Redis và BullMQ nằm ngoài DI
   * của Nest (chúng thuộc `@repo/core`) nên phải đóng tay — không đóng thì
   * tiến trình không thoát, và trình quản lý tiến trình phải SIGKILL sau
   * timeout, cắt ngang mọi request đang dở.
   */
  app.enableShutdownHooks();

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void (async () => {
        bootLogger.log(`Nhận ${signal} — đang tắt…`);
        try {
          await app.close();
          await closeQueue();
          await closeRedis();
          process.exit(0);
        } catch (error) {
          logger.error("Tắt không sạch", error);
          process.exit(1);
        }
      })();
    });
  }

  await app.listen(env.PORT, "0.0.0.0");
  bootLogger.log(`API: http://localhost:${env.PORT}/api/v1 (NODE_ENV=${env.NODE_ENV})`);
}

// Không có `.catch()` thì lỗi lúc khởi động thành unhandled rejection: tiến
// trình vẫn thoát nhưng exit code là 0, và trình quản lý tiến trình tưởng mọi
// thứ ổn.
bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Không khởi động được API", error);
  process.exit(1);
});
