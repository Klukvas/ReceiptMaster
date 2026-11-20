import { ApiErrors } from "../../common/errors/ApiError";
import { CreemController } from "./creem.controller";
import { CreemService } from "./creem.service";

describe("CreemController webhook", () => {
  const signedEvent = {
    id: "evt_1",
    eventType: "subscription.paid",
    object: {},
  };
  const body = '{"eventType":"subscription.paid"}';
  const makeRequest = (rawBody?: Buffer) => ({ rawBody }) as never;

  function setup() {
    const service = {
      isBillingEnabled: jest.fn().mockReturnValue(true),
      assertBillingEnabled: jest.fn(),
      verifyWebhook: jest.fn().mockReturnValue(signedEvent),
      handleWebhookEvent: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new CreemController(service as unknown as CreemService);
    return { controller, service };
  }

  it("verifies the raw body against the signature and processes the event", async () => {
    const { controller, service } = setup();

    await expect(
      controller.webhook(makeRequest(Buffer.from(body)), "a1b2c3"),
    ).resolves.toEqual({ ok: true });
    expect(service.verifyWebhook).toHaveBeenCalledWith(body, "a1b2c3");
    expect(service.handleWebhookEvent).toHaveBeenCalledWith(signedEvent);
  });

  it.each([
    ["the signature header", makeRequest(Buffer.from(body)), undefined],
    ["the raw body", makeRequest(), "a1b2c3"],
  ])(
    "answers 400 without verifying when %s is missing",
    async (_name, request, signature) => {
      const { controller, service } = setup();

      await expect(
        controller.webhook(request, signature),
      ).rejects.toMatchObject({
        errorCode: "WEBHOOK_SIGNATURE_INVALID",
        statusCode: 400,
      });
      expect(service.verifyWebhook).not.toHaveBeenCalled();
    },
  );

  it("passes a verification failure through unchanged and processes nothing", async () => {
    const { controller, service } = setup();
    service.verifyWebhook.mockImplementation(() => {
      throw ApiErrors.BILLING_UNAVAILABLE();
    });

    await expect(
      controller.webhook(makeRequest(Buffer.from(body)), "a1b2c3"),
    ).rejects.toMatchObject({
      errorCode: "BILLING_UNAVAILABLE",
      statusCode: 503,
    });
    expect(service.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it("lets a processing failure through so it becomes a 500 and Creem retries", async () => {
    const { controller, service } = setup();
    service.handleWebhookEvent.mockRejectedValue(
      new Error("DB connection failed"),
    );

    await expect(
      controller.webhook(makeRequest(Buffer.from(body)), "a1b2c3"),
    ).rejects.toThrow("DB connection failed");
  });

  it("checks the billing switch before anything else", async () => {
    const { controller, service } = setup();
    service.assertBillingEnabled.mockImplementation(() => {
      throw ApiErrors.BILLING_DISABLED();
    });

    await expect(
      controller.webhook(makeRequest(), undefined),
    ).rejects.toMatchObject({
      errorCode: "BILLING_DISABLED",
    });
  });
});
