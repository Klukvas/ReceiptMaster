import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { VoidReceiptDto } from "./void-receipt.dto";

/** The production pipe: a bad body must be a 400, never reach the service. */
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const run = (body: unknown) =>
  pipe.transform(body, { type: "body", metatype: VoidReceiptDto });

describe("VoidReceiptDto", () => {
  it.each([{}, { reason: "Помилка у сумі" }, { reason: "x".repeat(500) }])(
    "accepts %j",
    async (body) => {
      await expect(run(body)).resolves.toBeInstanceOf(VoidReceiptDto);
    },
  );

  it("trims the reason", async () => {
    await expect(run({ reason: "  oops  " })).resolves.toMatchObject({
      reason: "oops",
    });
  });

  it.each([
    [{ reason: "x".repeat(501) }],
    [{ reason: 5 }],
    [{ reason: { a: 1 } }],
    [{ reason: ["a"] }],
    [{ reason: true }],
  ])("refuses %j with a 400", async (body) => {
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ignores unknown keys", async () => {
    const dto = await run({ reason: "r", status: "generated" });
    expect(dto).not.toHaveProperty("status");
  });
});
