import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";
import { EnvConfig } from "./config/env.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // WebSocket adapter (Socket.IO)
  app.useWebSocketAdapter(new IoAdapter(app));

  const configService = app.get(ConfigService<EnvConfig>);
  const apiPrefix = configService.get("API_PREFIX");
  const port = configService.get("PORT");

  // Global validation — whitelist strips unknown properties silently.
  // forbidNonWhitelisted is NOT used because multiple @Query() DTOs
  // (e.g. PaginationDto + DateRangeDto) each receive all query params
  // and would reject each other's fields.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // API prefix (исключаем Telegram webhook)
  app.setGlobalPrefix(apiPrefix, {
    exclude: ["tg/webhook", "tg/order"],
  });

  // CORS - configure via CORS_ORIGINS env variable (comma-separated list)
  const corsOriginsEnv = configService.get("CORS_ORIGINS");
  const corsOrigins = corsOriginsEnv
    ? corsOriginsEnv.split(",").map((origin: string) => origin.trim())
    : [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
      ];

  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "Idempotency-Key"],
    credentials: true,
  });

  // Handle favicon.ico requests
  app.use("/favicon.ico", (req, res) => {
    res.status(204).end();
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("ReceiptMaster API")
    .setDescription(
      "Multi-tenant SaaS API for managing products, recipients, orders, receipts, and analytics.",
    )
    .setVersion("1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "bearer",
    )
    .addApiKey({ type: "apiKey", name: "X-API-Key", in: "header" }, "api-key")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  await app.listen(port);
}

bootstrap();
