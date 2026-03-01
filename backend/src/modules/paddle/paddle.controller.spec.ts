import { BadRequestException } from "@nestjs/common";
import { PaddleController } from "./paddle.controller";

describe("PaddleController", () => {
  let controller: PaddleController;
  let paddleService: any;

  beforeEach(() => {
    paddleService = {
      verifyWebhook: jest.fn(),
      handleWebhookEvent: jest.fn(),
    };

    controller = new PaddleController(paddleService);
  });

  describe("webhook", () => {
    const makeReq = (rawBody?: Buffer) =>
      ({ rawBody } as any);

    it("should return 400 if Paddle-Signature header is missing", async () => {
      await expect(
        controller.webhook(makeReq(Buffer.from("{}")), undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it("should return 400 if raw body is missing", async () => {
      await expect(
        controller.webhook(makeReq(), "ts=123;h1=abc"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should verify webhook and process event on valid request", async () => {
      const mockEvent = { eventType: "subscription.created", data: {} };
      paddleService.verifyWebhook.mockResolvedValue(mockEvent);
      paddleService.handleWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.webhook(
        makeReq(Buffer.from('{"event_type":"subscription.created"}')),
        "ts=123;h1=abc",
      );

      expect(paddleService.verifyWebhook).toHaveBeenCalledWith(
        '{"event_type":"subscription.created"}',
        "ts=123;h1=abc",
      );
      expect(paddleService.handleWebhookEvent).toHaveBeenCalledWith(mockEvent);
      expect(result).toEqual({ ok: true });
    });

    // C2: Signature failure → 400
    it("should throw BadRequestException on invalid signature", async () => {
      paddleService.verifyWebhook.mockRejectedValue(
        new Error("Invalid signature"),
      );

      await expect(
        controller.webhook(
          makeReq(Buffer.from("{}")),
          "ts=123;h1=invalid",
        ),
      ).rejects.toThrow(BadRequestException);

      expect(paddleService.handleWebhookEvent).not.toHaveBeenCalled();
    });

    // C2: Processing failure → 500 (propagates, Paddle will retry)
    it("should propagate processing errors as 500 (not 400)", async () => {
      const mockEvent = { eventType: "subscription.created", data: {} };
      paddleService.verifyWebhook.mockResolvedValue(mockEvent);
      paddleService.handleWebhookEvent.mockRejectedValue(
        new Error("DB connection failed"),
      );

      await expect(
        controller.webhook(
          makeReq(Buffer.from("{}")),
          "ts=123;h1=valid",
        ),
      ).rejects.toThrow("DB connection failed");

      // Should NOT throw BadRequestException — this ensures 500
      await expect(
        controller.webhook(
          makeReq(Buffer.from("{}")),
          "ts=123;h1=valid",
        ),
      ).rejects.not.toThrow(BadRequestException);
    });
  });
});
