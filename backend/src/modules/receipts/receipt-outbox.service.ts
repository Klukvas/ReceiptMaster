import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Interval } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { ReceiptGenerationOutbox } from "./entities/receipt-generation-outbox.entity";
import {
  RECEIPT_PUBLISHER_FACTORY,
  ReceiptPublisher,
  ReceiptPublisherFactory,
} from "./receipt-publisher";
import { runWithTenant } from "../../common/tenancy/tenant-context";

export function generationJobId(
  receiptId: string,
  generationId: string,
): string {
  return `receipt-${receiptId}-${generationId}`;
}

export const RECEIPT_PUBLISH_TIMEOUT_MS = 2000;

@Injectable()
export class ReceiptOutboxService implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptOutboxService.name);
  private running = false;
  private publisher?: ReceiptPublisher;
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(RECEIPT_PUBLISHER_FACTORY)
    private readonly createPublisher: ReceiptPublisherFactory,
  ) {}

  private async redisCall<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Receipt publisher timed out")),
            RECEIPT_PUBLISH_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private discardPublisher(): void {
    const publisher = this.publisher;
    this.publisher = undefined;
    try {
      publisher?.close();
    } catch (error) {
      this.logger.warn(
        error instanceof Error ? error.message : "Publisher close failed",
      );
    }
  }

  onModuleDestroy(): void {
    this.discardPublisher();
  }

  @Interval(10000)
  async dispatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // The operational outbox has no RLS; receipt access below enters its tenant.
      const entries = await this.dataSource
        .getRepository(ReceiptGenerationOutbox)
        .find({ order: { created_at: "ASC" } });
      for (const entry of entries) {
        await runWithTenant(entry.user_id, async () => {
          const receipts = this.dataSource.getRepository(Receipt);
          const receipt = await receipts.findOne({
            where: { id: entry.receipt_id, user_id: entry.user_id },
            select: [
              "id",
              "user_id",
              "generation_id",
              "status",
              "replacement_status",
              "active_revision",
              "pending_id",
            ],
          });
          if (
            !receipt ||
            receipt.generation_id !== entry.generation_id ||
            (receipt.status !== ReceiptStatus.PROCESSING &&
              !(
                receipt.status === ReceiptStatus.GENERATED &&
                receipt.replacement_status === "processing"
              ))
          ) {
            await this.dataSource
              .getRepository(ReceiptGenerationOutbox)
              .delete(entry.id);
            return;
          }
          const jobId = generationJobId(entry.receipt_id, entry.generation_id);
          const publisher =
            this.publisher ?? (this.publisher = this.createPublisher());
          const job = await this.redisCall(() => publisher.queue.getJob(jobId));
          if (job) {
            const state = await this.redisCall(() => job.getState());
            if (state === "failed" || state === "completed") {
              await receipts.update(
                {
                  id: receipt.id,
                  user_id: entry.user_id,
                  generation_id: entry.generation_id,
                  status: receipt.status,
                  ...(receipt.status === ReceiptStatus.GENERATED
                    ? {
                        replacement_status: "processing" as const,
                        active_revision: receipt.active_revision,
                        pending_id: receipt.pending_id,
                      }
                    : {}),
                },
                receipt.status === ReceiptStatus.GENERATED
                  ? {
                      replacement_status: "failed",
                      replacement_error:
                        "Replacement stopped; retry the frozen candidate",
                    }
                  : {
                      status: ReceiptStatus.FAILED,
                      error_message: "Receipt generation stopped; please retry",
                    },
              );
            }
            return;
          }
          await this.redisCall(() =>
            publisher.queue.add(
              "generate",
              {
                receiptId: entry.receipt_id,
                orderId: entry.order_id,
                userId: entry.user_id,
                generationId: entry.generation_id,
              },
              {
                jobId,
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: 100,
                removeOnFail: 200,
              },
            ),
          );
          await this.dataSource
            .getRepository(ReceiptGenerationOutbox)
            .update(entry.id, { published_at: new Date() });
        });
      }
    } catch (error) {
      this.discardPublisher();
      this.logger.warn(
        `Receipt outbox will retry: ${error instanceof Error ? error.message : "dispatch failed"}`,
      );
    } finally {
      this.running = false;
    }
  }
}
