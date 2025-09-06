import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { EnvConfig } from "./config/env.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService<EnvConfig>);
  const apiPrefix = configService.get("API_PREFIX");
  const port = configService.get("PORT");

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix(apiPrefix);

  // CORS
  app.enableCors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://116.203.176.71",
      "https://116.203.176.71",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
  });

  // Handle favicon.ico requests
  app.use("/favicon.ico", (req, res) => {
    res.status(204).end();
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("Market Service API")
    .setDescription("MVP trading service on NestJS")
    .setVersion("1.0")
    .addApiKey({ type: "apiKey", name: "X-API-Key", in: "header" }, "api-key")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  await app.listen(port);
}

bootstrap();
