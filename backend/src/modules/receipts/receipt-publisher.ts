import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import {
  RECEIPT_GENERATION_QUEUE,
  ReceiptGenerationJobData,
} from "./receipt-generation.processor";

export const RECEIPT_PUBLISHER_FACTORY = Symbol("RECEIPT_PUBLISHER_FACTORY");
export interface ReceiptPublisher {
  queue: Queue<ReceiptGenerationJobData>;
  close(): void;
}
export type ReceiptPublisherFactory = () => ReceiptPublisher;

/** Publisher clients fail fast; worker clients retain BullMQ's retry requirements. */
export function createReceiptPublisherFactory(
  config: ConfigService,
): ReceiptPublisherFactory {
  return () => {
    const logger = new Logger("ReceiptPublisher");
    const connection = new Redis({
      host: config.get("REDIS_HOST", "localhost"),
      port: config.get("REDIS_PORT", 6379),
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    const queue: Queue<ReceiptGenerationJobData> =
      new Queue<ReceiptGenerationJobData>(RECEIPT_GENERATION_QUEUE, {
        // BullMQ and this workspace resolve separate ioredis type installations.
        connection: connection as unknown as ConnectionOptions,
      });
    queue.on("error", (error: Error) => logger.warn(error.message));
    return {
      queue,
      close() {
        // Direct disconnect does not await BullMQ readiness or a reconnect loop.
        connection.disconnect();
        void queue
          .close()
          .catch((error: unknown) =>
            logger.warn(
              error instanceof Error ? error.message : "Publisher close failed",
            ),
          );
      },
    };
  };
}
