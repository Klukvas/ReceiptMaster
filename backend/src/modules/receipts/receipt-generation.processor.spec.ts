import { Job } from "bullmq";
import {
  ReceiptGenerationProcessor,
  ReceiptGenerationJobData,
} from "./receipt-generation.processor";
import { ReceiptArtifactService } from "./services/receipt-artifact.service";
import { ReceiptsGateway } from "./receipts.gateway";
import { tenantStore } from "../../common/tenancy/tenant-context";
const userId = "11111111-1111-4111-8111-111111111111";
const data = {
  receiptId: "receipt",
  orderId: "order",
  generationId: "generation",
  userId,
};
function job(attemptsMade = 0) {
  return {
    data,
    attemptsMade,
    opts: { attempts: 3 },
  } as Job<ReceiptGenerationJobData>;
}
describe("frozen receipt worker", () => {
  const artifacts = { execute: jest.fn(), failed: jest.fn() };
  const gateway = {
    emitProgress: jest.fn(),
    emitCompleted: jest.fn(),
    emitFailed: jest.fn(),
  };
  let processor: ReceiptGenerationProcessor;
  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ReceiptGenerationProcessor(
      artifacts as unknown as ReceiptArtifactService,
      gateway as unknown as ReceiptsGateway,
    );
  });
  it("renders the stored candidate inside its tenant and emits completion only after promotion", async () => {
    artifacts.execute.mockImplementation(
      async (_id, _user, _generation, onEligible) => {
        onEligible();
        expect(tenantStore.getStore()).toEqual({ userId });
        return { number: "INV-1", pdf_url: "immutable.pdf" };
      },
    );
    await processor.process(job());
    expect(artifacts.execute).toHaveBeenCalledWith(
      "receipt",
      userId,
      "generation",
      expect.any(Function),
    );
    expect(gateway.emitProgress).toHaveBeenCalledTimes(1);
    expect(gateway.emitCompleted).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        receiptNumber: "INV-1",
        pdfUrl: "immutable.pdf",
      }),
    );
  });
  it("does not emit progress, completion or failure when a superseded or voided candidate loses promotion", async () => {
    artifacts.execute.mockResolvedValue(null);
    await processor.process(job());
    expect(gateway.emitCompleted).not.toHaveBeenCalled();
    expect(gateway.emitProgress).not.toHaveBeenCalled();
    expect(gateway.emitFailed).not.toHaveBeenCalled();
  });
  it("throws rendering/storage errors so BullMQ retries the same candidate", async () => {
    artifacts.execute.mockRejectedValue(new Error("render failed"));
    await expect(processor.process(job())).rejects.toThrow("render failed");
    expect(artifacts.failed).not.toHaveBeenCalled();
  });
  it("does not mark failed while attempts remain", async () => {
    await processor.onFailed(job(2), new Error("retry"));
    expect(artifacts.failed).not.toHaveBeenCalled();
  });
  it("marks only the matching generation failed on exhaustion in its tenant", async () => {
    artifacts.failed.mockImplementation(async () => {
      expect(tenantStore.getStore()).toEqual({ userId });
      return true;
    });
    await processor.onFailed(job(3), new Error("exhausted"));
    expect(artifacts.failed).toHaveBeenCalledWith(
      "receipt",
      userId,
      "generation",
    );
    expect(gateway.emitFailed).toHaveBeenCalledTimes(1);
  });
  it("does not emit failure for an obsolete job", async () => {
    artifacts.failed.mockResolvedValue(false);
    await processor.onFailed(job(3), new Error("obsolete"));
    expect(gateway.emitFailed).not.toHaveBeenCalled();
  });
  it("keeps the worker alive when exhaustion persistence is temporarily unavailable", async () => {
    artifacts.failed.mockRejectedValue(new Error("Database unavailable"));
    await expect(
      processor.onFailed(job(3), new Error("render failed")),
    ).resolves.toBeUndefined();
    expect(gateway.emitFailed).not.toHaveBeenCalled();
  });
});
