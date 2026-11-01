import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrdersService } from "./orders.service";
import { OrdersDashboardService } from "./orders-dashboard.service";
import { OrdersController } from "./orders.controller";
import { IdempotencyCleanupService } from "./idempotency-cleanup.service";
import { Order } from "./entities/order.entity";
import { OrderItem } from "./entities/order-item.entity";
import { IdempotencyKey } from "./entities/idempotency-key.entity";
import { Product } from "../products/entities/product.entity";
import { Recipient } from "../recipients/entities/recipient.entity";
import { ReceiptsModule } from "../receipts/receipts.module";
import { SubscriptionModule } from "../subscription/subscription.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      IdempotencyKey,
      Product,
      Recipient,
    ]),
    ReceiptsModule,
    SubscriptionModule,
    SettingsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersDashboardService, IdempotencyCleanupService],
  exports: [OrdersService],
})
export class OrdersModule {}
