import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Job } from "bullmq";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { Order } from "../orders/entities/order.entity";
import {
  PdfGeneratorService,
  ReceiptStyle,
} from "./services/pdf-generator.service";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { SettingsService } from "../settings/services/settings.service";
import { ReceiptsGateway } from "./receipts.gateway";

export interface ReceiptGenerationJobData {
  receiptId: string;
  orderId: string;
  userId: string;
}

export const RECEIPT_GENERATION_QUEUE = "receipt-generation";

@Processor(RECEIPT_GENERATION_QUEUE, { concurrency: 1 })
export class ReceiptGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptGenerationProcessor.name);

  constructor(
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectDataSource()
    private dataSource: DataSource,
    private pdfGeneratorService: PdfGeneratorService,
    private pdfStorageService: PdfStorageService,
    private settingsService: SettingsService,
    private receiptsGateway: ReceiptsGateway,
  ) {
    super();
  }

  private getReceiptStyleFromTemplateId(templateId: string): ReceiptStyle {
    const map: Record<string, ReceiptStyle> = {
      standard: ReceiptStyle.STANDARD,
      compact: ReceiptStyle.COMPACT,
      classic: ReceiptStyle.CLASSIC,
      modern: ReceiptStyle.MODERN,
      elegant: ReceiptStyle.ELEGANT,
      vintage: ReceiptStyle.VINTAGE,
      tech: ReceiptStyle.TECH,
      wave: ReceiptStyle.WAVE,
      minimal: ReceiptStyle.MINIMAL,
      corporate: ReceiptStyle.CORPORATE,
      thermal: ReceiptStyle.THERMAL,
      dark: ReceiptStyle.DARK,
      branded: ReceiptStyle.BRANDED,
      delivery: ReceiptStyle.DELIVERY,
      proforma: ReceiptStyle.PROFORMA,
    };
    return map[templateId] || ReceiptStyle.COMPACT;
  }

  private async updateProgress(
    receiptId: string,
    orderId: string,
    userId: string,
    progress: number,
    stage: string,
  ): Promise<void> {
    await this.receiptsRepository.update(receiptId, { progress });
    this.receiptsGateway.emitProgress(userId, {
      receiptId,
      orderId,
      progress,
      stage,
    });
  }

  async process(job: Job<ReceiptGenerationJobData>): Promise<void> {
    const { receiptId, orderId, userId } = job.data;
    this.logger.log(
      `Processing receipt generation: receipt=${receiptId}, order=${orderId}`,
    );

    try {
      // Stage 1: Loading order data
      await this.updateProgress(
        receiptId,
        orderId,
        userId,
        10,
        "loading_order",
      );

      const order = await this.ordersRepository.findOne({
        where: { id: orderId, user_id: userId },
        relations: ["recipient", "items"],
      });

      if (!order) {
        this.logger.error(`Order ${orderId} not found for user ${userId}`);
        await this.markFailed(receiptId, orderId, userId, "Order not found");
        return;
      }

      // Stage 2: Loading settings
      await this.updateProgress(
        receiptId,
        orderId,
        userId,
        20,
        "loading_settings",
      );

      const receipt = await this.receiptsRepository.findOne({
        where: { id: receiptId },
      });

      if (!receipt || receipt.status !== ReceiptStatus.PROCESSING) {
        this.logger.warn(
          `Receipt ${receiptId} not found or not in PROCESSING state`,
        );
        return;
      }

      const pdfSettings = await this.settingsService.getAllPdfSettings(userId);
      const receiptStyle = this.getReceiptStyleFromTemplateId(
        pdfSettings.templateId,
      );

      this.logger.log(
        `Generating PDF for receipt ${receipt.number} with template ${pdfSettings.templateId}`,
      );

      // Stage 3: Generating PDF
      await this.updateProgress(
        receiptId,
        orderId,
        userId,
        40,
        "generating_pdf",
      );

      const { filePath, url, html } =
        await this.pdfGeneratorService.generateReceiptPdf(
          order,
          receipt.number,
          pdfSettings.companyInfo,
          userId,
          receiptStyle,
          pdfSettings.receiptTitle,
          pdfSettings.templateLanguage,
          pdfSettings.footerTitle,
          pdfSettings.footerSubtitle,
          pdfSettings.primaryColor,
          pdfSettings.paymentTerms,
          pdfSettings.deliveryTerms,
        );

      // Stage 4: Computing hash
      await this.updateProgress(
        receiptId,
        orderId,
        userId,
        70,
        "computing_hash",
      );

      let fileBuffer: Buffer;
      if (filePath.startsWith("object-storage://")) {
        const parsed = this.pdfStorageService.parseObjectStoragePath(filePath);
        if (!parsed) {
          throw new Error(`Invalid object storage path: ${filePath}`);
        }
        fileBuffer = await this.pdfStorageService.downloadFile(
          parsed.bucket,
          parsed.key,
        );
      } else {
        fileBuffer = await fs.readFile(filePath);
      }
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Stage 5: Saving to database
      await this.updateProgress(receiptId, orderId, userId, 80, "saving");

      await this.dataSource.transaction(async (manager) => {
        await manager.update(Receipt, receiptId, {
          pdf_path: filePath,
          pdf_url: url,
          hash,
          html_snapshot: html,
          template_id: pdfSettings.templateId,
          template_version: 1,
          status: ReceiptStatus.GENERATED,
          progress: 100,
        });

        await manager.update(Order, { id: orderId }, { is_locked: true });
      });

      // Emit completion event
      this.receiptsGateway.emitCompleted(userId, {
        receiptId,
        orderId,
        pdfUrl: url,
        receiptNumber: receipt.number,
      });

      this.logger.log(
        `Receipt ${receipt.number} generated successfully. Order ${orderId} locked.`,
      );
    } catch (error) {
      // Log and rethrow so BullMQ retries. The receipt is only marked FAILED
      // once every attempt is exhausted — see onFailed() — so retries keep the
      // receipt in PROCESSING instead of prematurely flipping its status.
      this.logger.error(
        `Receipt ${receiptId} generation attempt ${(job.attemptsMade ?? 0) + 1}/${
          job.opts?.attempts ?? 1
        } failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @OnWorkerEvent("failed")
  async onFailed(
    job: Job<ReceiptGenerationJobData>,
    error: Error,
  ): Promise<void> {
    if (!job) return;

    const attempts = job.opts.attempts ?? 1;
    // Fires after every failed attempt; only act once retries are exhausted.
    if (job.attemptsMade < attempts) {
      return;
    }

    const { receiptId, orderId, userId } = job.data;
    this.logger.error(
      `Receipt ${receiptId} permanently failed after ${job.attemptsMade} attempts: ${error?.message}`,
    );
    await this.markFailed(
      receiptId,
      orderId,
      userId,
      error?.message ?? "Receipt generation failed",
    );
  }

  private async markFailed(
    receiptId: string,
    orderId: string,
    userId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.receiptsRepository.update(
        { id: receiptId, status: ReceiptStatus.PROCESSING },
        { status: ReceiptStatus.FAILED, error_message: errorMessage },
      );
      this.receiptsGateway.emitFailed(userId, {
        receiptId,
        orderId,
        error: errorMessage,
      });
    } catch (err) {
      this.logger.error(
        `Failed to mark receipt ${receiptId} as failed: ${err.message}`,
      );
    }
  }
}
