import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER } from '@nestjs/core';
import { envSchema } from './config/env.schema';
import { createDataSource } from './config/database.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ProductsModule } from './modules/products/products.module';
import { RecipientsModule } from './modules/recipients/recipients.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { UsersModule } from './modules/users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
        const result = envSchema.safeParse(config);
        if (!result.success) {
          throw new Error(`Configuration validation error: ${result.error.message}`);
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
          type: 'postgres',
          host: configService.get('DB_HOST'),
          port: configService.get('DB_PORT'),
          username: configService.get('DB_USERNAME'),
          password: configService.get('DB_PASSWORD'),
          database: configService.get('DB_NAME'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/config/migrations/*{.ts,.js}'],
          synchronize: false,
          logging: process.env.NODE_ENV === 'development',
        };
      },
      inject: [ConfigService],
    }),
    ProductsModule,
    RecipientsModule,
    OrdersModule,
    ReceiptsModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
