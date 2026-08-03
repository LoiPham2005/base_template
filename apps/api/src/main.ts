import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import { AppModule } from "./app.module";
import { env, isProduction } from "./env";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // BẮT BUỘC khi chạy sau reverse proxy (Caddy/nginx/Railway).
      //
      // ThrottlerGuard giới hạn tần suất theo IP. Không bật trustProxy thì
      // Fastify lấy IP của chính proxy cho MỌI request — tức là toàn bộ người
      // dùng chung một bộ đếm, và một người spam là khoá luôn tất cả những
      // người còn lại. Bật lên thì Fastify đọc X-Forwarded-For do proxy đặt.
      //
      // An toàn vì Caddyfile GHI ĐÈ X-Forwarded-For bằng {remote_host} thay vì
      // nối thêm — client không tự khai man IP được.
      trustProxy: true,
    }),
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
  });

  // Swagger mặc định TẮT trên production. Một trang /docs công khai liệt kê
  // sẵn mọi endpoint, mọi tham số và mọi mã lỗi — tiện cho người dò hệ thống
  // hơn là cho bạn.
  if (env.ENABLE_SWAGGER && !isProduction) {
    const config = new DocumentBuilder()
      .setTitle("Base Template API")
      .setDescription("REST API dùng chung cho web và mobile")
      .setVersion("1.0")
      .addBearerAuth()
      .build();

    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
    logger.log(`Swagger bật tại http://localhost:${env.PORT}/docs`);
  }

  // Đóng kết nối database và cho request đang chạy hoàn tất trước khi thoát;
  // không có dòng này thì container bị dừng sẽ cắt ngang giữa chừng.
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  logger.log(`API chạy tại http://localhost:${env.PORT} (NODE_ENV=${env.NODE_ENV})`);
}

// Không có .catch() thì lỗi lúc khởi động thành unhandled rejection: tiến trình
// vẫn thoát nhưng exit code là 0, và trình quản lý tiến trình tưởng mọi thứ ổn.
bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Không khởi động được API", error);
  process.exit(1);
});
