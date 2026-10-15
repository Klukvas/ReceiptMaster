import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule, TypeOrmModuleAsyncOptions } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { envSchema } from "./config/env.schema";
import { GlobalExceptionFilter } from "./common/filters/GlobalExceptionFilter";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { TenantInterceptor } from "./common/tenancy/tenant.interceptor";
import { installTenantContext } from "./common/tenancy/tenant-data-source";
import { DataSource, DataSourceOptions } from "typeorm";
import { AuditLogInterceptor } from "./common/interceptors/audit-log.interceptor";
import { AuditLogService } from "./common/services/audit-log.service";
import { AuditLog } from "./common/entities/audit-log.entity";
import { CacheModule } from "./common/modules/cache.module";
import { QueueModule } from "./common/modules/queue.module";
import { ProductsModule } from "./modules/products/products.module";
import { RecipientsModule } from "./modules/recipients/recipients.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { ReceiptsModule } from "./modules/receipts/receipts.module";
import { UsersModule } from "./modules/users/users.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { TelegramModule } from "./modules/telegram/telegram.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { SubscriptionModule } from "./modules/subscription/subscription.module";
import { HealthController } from "./health.controller";
import { MigrationService } from "./common/services/migration.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === "test",
      validate: (config) => {
        const result = envSchema.safeParse(config);
        if (!result.success) {
          throw new Error(
            `Configuration validation error: ${result.error.message}`,
          );
        }
        return result.data;
      },
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          type: "postgres",
          host: configService.get("DB_HOST"),
          port: configService.get("DB_PORT"),
          username: configService.get("DB_USERNAME"),
          password: configService.get("DB_PASSWORD"),
          database: configService.get("DB_NAME"),
          entities: [__dirname + "/**/*.entity{.ts,.js}"],
          migrations: [__dirname + "/config/migrations/*{.ts,.js}"],
          synchronize: false,
          logging: process.env.NODE_ENV === "development",
          extra: {
            max: configService.get<number>("DB_POOL_MAX", 20),
            min: configService.get<number>("DB_POOL_MIN", 2),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
          },
        };
      },
      inject: [ConfigService],
      dataSourceFactory: async (options) => {
        const source = installTenantContext(
          await new DataSource(
            options as unknown as DataSourceOptions,
          ).initialize(),
        );
        // Nest and the workspace can resolve separate TypeORM installations.
        return source as unknown as Awaited<
          ReturnType<
            NonNullable<TypeOrmModuleAsyncOptions["dataSourceFactory"]>
          >
        >;
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    TypeOrmModule.forFeature([AuditLog]),
    CacheModule,
    QueueModule,
    ProductsModule,
    RecipientsModule,
    OrdersModule,
    ReceiptsModule,
    UsersModule,
    SettingsModule,
    TelegramModule,
    SuppliersModule,
    SubscriptionModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    AuditLogService,
    MigrationService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
