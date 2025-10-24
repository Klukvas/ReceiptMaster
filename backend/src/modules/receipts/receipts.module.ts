import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReceiptsService } from "./receipts.service";
import { ReceiptsController } from "./receipts.controller";
import { PdfTestController } from "./controllers/pdf-test.controller";
import { PdfGeneratorService } from "./services/pdf-generator.service";
import { TemplateService } from "./services/template.service";
import { PlaywrightPdfGenerator } from "./services/playwright-pdf-generator.service";
import { Receipt } from "./entities/receipt.entity";
import { Order } from "../orders/entities/order.entity";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Receipt, Order]),
    SettingsModule,
  ],
  controllers: [ReceiptsController, PdfTestController],
  providers: [
    ReceiptsService,
    PdfGeneratorService,
    TemplateService,
    PlaywrightPdfGenerator,
    PdfStorageService,
  ],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
