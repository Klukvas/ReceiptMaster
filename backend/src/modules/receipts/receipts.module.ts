import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ReceiptsService } from "./receipts.service";
import { ReceiptsController } from "./receipts.controller";
import { PublicReceiptsController } from "./public-receipts.controller";
import { PdfTestController } from "./controllers/pdf-test.controller";
import { PdfGeneratorService } from "./services/pdf-generator.service";
import { TemplateService } from "./services/template.service";
import { PlaywrightPdfGenerator } from "./services/playwright-pdf-generator.service";
import { Receipt } from "./entities/receipt.entity";
import { Order } from "../orders/entities/order.entity";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { SettingsModule } from "../settings/settings.module";
import {
  ReceiptGenerationProcessor,
  RECEIPT_GENERATION_QUEUE,
} from "./receipt-generation.processor";
import {
  RECEIPT_PUBLISHER_FACTORY,
  createReceiptPublisherFactory,
} from "./receipt-publisher";
import { ReceiptOutboxService } from "./receipt-outbox.service";
import { ReceiptGenerationOutbox } from "./entities/receipt-generation-outbox.entity";
import { ReceiptsGateway } from "./receipts.gateway";

@Module({
  imports: [
    TypeOrmModule.forFeature([Receipt, Order, ReceiptGenerationOutbox]),
    BullModule.registerQueue({ name: RECEIPT_GENERATION_QUEUE }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
      }),
      inject: [ConfigService],
    }),
    SettingsModule,
  ],
  controllers: [
    ReceiptsController,
    PublicReceiptsController,
    PdfTestController,
  ],
  providers: [
    ReceiptsService,
    ReceiptOutboxService,
    {
      provide: RECEIPT_PUBLISHER_FACTORY,
      inject: [ConfigService],
      useFactory: createReceiptPublisherFactory,
    },
    PdfGeneratorService,
    TemplateService,
    PlaywrightPdfGenerator,
    PdfStorageService,
    ReceiptGenerationProcessor,
    ReceiptsGateway,
  ],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
