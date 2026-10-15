import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import { runWithTenant } from "../../common/tenancy/tenant-context";
import { ReceiptsGateway } from "./receipts.gateway";
import { ReceiptArtifactService } from "./services/receipt-artifact.service";
export interface ReceiptGenerationJobData {
  receiptId: string;
  orderId: string;
  userId: string;
  generationId: string;
}
export const RECEIPT_GENERATION_QUEUE = "receipt-generation";
@Processor(RECEIPT_GENERATION_QUEUE, { concurrency: 1 })
export class ReceiptGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptGenerationProcessor.name);
  constructor(
    private readonly artifacts: ReceiptArtifactService,
    private readonly gateway: ReceiptsGateway,
  ) {
    super();
  }
  async process(job: Job<ReceiptGenerationJobData>): Promise<void> {
    await runWithTenant(job.data.userId, async () => {
      const { receiptId, orderId, userId, generationId } = job.data;
      const receipt = await this.artifacts.execute(
        receiptId,
        userId,
        generationId,
        () =>
          this.gateway.emitProgress(userId, {
            receiptId,
            orderId,
            progress: 40,
            stage: "generating_pdf",
          }),
      );
      if (receipt)
        this.gateway.emitCompleted(userId, {
          receiptId,
          orderId,
          pdfUrl: receipt.pdf_url,
          receiptNumber: receipt.number,
        });
    });
  }
  @OnWorkerEvent("failed")
  async onFailed(
    job: Job<ReceiptGenerationJobData>,
    error: Error,
  ): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    this.logger.error(
      `Frozen render ${job.data.receiptId} failed: ${error.message}`,
    );
    try {
      await runWithTenant(job.data.userId, async () => {
        if (
          await this.artifacts.failed(
            job.data.receiptId,
            job.data.userId,
            job.data.generationId,
          )
        )
          this.gateway.emitFailed(job.data.userId, {
            receiptId: job.data.receiptId,
            orderId: job.data.orderId,
            error: "Generation failed; retry the frozen document.",
          });
      });
    } catch (failure) {
      this.logger.warn(
        `Failure state will be reconciled by the outbox: ${failure instanceof Error ? failure.message : "state update failed"}`,
      );
    }
  }
}
