import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReceiptsService } from "./receipts.service";
import { ReceiptsController } from "./receipts.controller";
import { ReactPdfGeneratorService } from "./services/react-pdf-generator.service";
import { CompactPdfGeneratorService } from "./services/compact-pdf-generator.service";
import { Receipt } from "./entities/receipt.entity";
import { Order } from "../orders/entities/order.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Receipt, Order])],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReactPdfGeneratorService, CompactPdfGeneratorService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
