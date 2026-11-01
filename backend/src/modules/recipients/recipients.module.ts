import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RecipientsService } from "./recipients.service";
import { RecipientsController } from "./recipients.controller";
import { Recipient } from "./entities/recipient.entity";
import { IdempotencyKey } from "../orders/entities/idempotency-key.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Recipient, IdempotencyKey])],
  controllers: [RecipientsController],
  providers: [RecipientsService],
  exports: [RecipientsService],
})
export class RecipientsModule {}
