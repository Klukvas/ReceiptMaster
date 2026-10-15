import {
  ReceiptOutboxService,
  RECEIPT_PUBLISH_TIMEOUT_MS,
  generationJobId,
} from "./receipt-outbox.service";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { ReceiptGenerationOutbox } from "./entities/receipt-generation-outbox.entity";
import { tenantStore } from "../../common/tenancy/tenant-context";

jest.mock("playwright", () => ({ chromium: {} }));
jest.mock("@react-pdf/renderer", () => ({
  Font: { register: jest.fn() },
  StyleSheet: { create: (value: unknown) => value },
}));

describe("durable receipt dispatch", () => {
  const entry = {
    id: "outbox-1",
    user_id: "11111111-1111-4111-8111-111111111111",
    receipt_id: "receipt-1",
    order_id: "order-1",
    generation_id: "generation-1",
  };
  let outbox: { find: jest.Mock; delete: jest.Mock; update: jest.Mock };
  let receipts: { findOne: jest.Mock; update: jest.Mock };
  let queue: { getJob: jest.Mock; add: jest.Mock };
  let dispatcher: ReceiptOutboxService;
  let closePublisher: jest.Mock;
  let createPublisher: jest.Mock;
  beforeEach(() => {
    outbox = {
      find: jest.fn().mockResolvedValue([entry]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    receipts = {
      findOne: jest.fn().mockImplementation(async () => {
        expect(tenantStore.getStore()).toEqual({ userId: entry.user_id });
        return {
          id: entry.receipt_id,
          generation_id: entry.generation_id,
          status: ReceiptStatus.PROCESSING,
        };
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({}),
    };
    const source = {
      getRepository: (entity: unknown) =>
        entity === Receipt
          ? receipts
          : entity === ReceiptGenerationOutbox
            ? outbox
            : undefined,
    };
    closePublisher = jest.fn();
    createPublisher = jest.fn(() => ({ queue, close: closePublisher }));
    dispatcher = new ReceiptOutboxService(
      source as never,
      createPublisher as never,
    );
  });
  it("leaves intent pending through a Redis outage and republishes later", async () => {
    queue.add.mockRejectedValueOnce(new Error("Redis unavailable"));
    await dispatcher.dispatch();
    expect(outbox.update).not.toHaveBeenCalled();
    expect(outbox.delete).not.toHaveBeenCalled();
    await dispatcher.dispatch();
    expect(outbox.update).toHaveBeenCalledWith(entry.id, {
      published_at: expect.any(Date),
    });
    expect(queue.add).toHaveBeenLastCalledWith(
      "generate",
      expect.objectContaining({ generationId: entry.generation_id }),
      expect.objectContaining({
        jobId: generationJobId(entry.receipt_id, entry.generation_id),
        attempts: 3,
      }),
    );
  });
  it("does not duplicate an active job when enqueue acknowledgement was lost", async () => {
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue("active"),
    });
    await dispatcher.dispatch();
    expect(queue.add).not.toHaveBeenCalled();
    expect(receipts.update).not.toHaveBeenCalled();
  });
  it("reconciles a published intent whose Redis job disappeared", async () => {
    outbox.find.mockResolvedValue([{ ...entry, published_at: new Date(0) }]);
    await dispatcher.dispatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
  it("recovers an exhausted job even when the worker failed-event database write was lost", async () => {
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue("failed"),
    });
    await dispatcher.dispatch();
    expect(receipts.update).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_id: entry.generation_id,
        status: ReceiptStatus.PROCESSING,
      }),
      expect.objectContaining({ status: ReceiptStatus.FAILED }),
    );
  });
  it("cleans terminal or superseded intents without publishing old generations", async () => {
    receipts.findOne.mockResolvedValue({
      generation_id: "new-generation",
      status: ReceiptStatus.PROCESSING,
    });
    await dispatcher.dispatch();
    expect(outbox.delete).toHaveBeenCalledWith(entry.id);
    expect(queue.add).not.toHaveBeenCalled();
  });
  it("bounds a stuck Redis attempt and recovers with a fresh publisher without late publication", async () => {
    jest.useFakeTimers();
    let finishRead: (value: null) => void;
    queue.getJob.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
    // Even asynchronous cleanup supplied by a broken adapter cannot hold running=true.
    closePublisher.mockImplementationOnce(() => new Promise(() => undefined));
    const nextQueue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({}),
    };
    createPublisher
      .mockReturnValueOnce({ queue, close: closePublisher })
      .mockReturnValueOnce({ queue: nextQueue, close: jest.fn() });
    try {
      const first = dispatcher.dispatch();
      await jest.advanceTimersByTimeAsync(RECEIPT_PUBLISH_TIMEOUT_MS + 1);
      await first;
      expect(closePublisher).toHaveBeenCalledTimes(1);
      expect(outbox.update).not.toHaveBeenCalled();
      await dispatcher.dispatch();
      expect(createPublisher).toHaveBeenCalledTimes(2);
      expect(nextQueue.add).toHaveBeenCalledTimes(1);
      finishRead(null);
      await Promise.resolve();
      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
