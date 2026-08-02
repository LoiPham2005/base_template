import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import { AppModule } from "./app.module";
import { env } from "./env";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  app.enableCors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle("Base Template API")
    .setDescription("Production-Ready REST API for Web & Mobile Clients")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  await app.listen(env.PORT, "0.0.0.0");
  console.log(
    `🚀 API Server running on http://localhost:${env.PORT} (Docs at http://localhost:${env.PORT}/docs)`,
  );
}

bootstrap();
