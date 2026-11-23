import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionController } from "./subscription.controller";
import { UserSubscription } from "./entities/user-subscription.entity";
import { Product } from "../products/entities/product.entity";
import { Order } from "../orders/entities/order.entity";
import { CreemModule } from "../creem/creem.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSubscription, Product, Order]),
    CreemModule,
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
