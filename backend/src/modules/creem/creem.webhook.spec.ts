import { createHmac } from "crypto";
import {
  isValidCreemSignature,
  parseCreemEvent,
  parseCreemSubscription,
  referenceId,
} from "./creem.webhook";

const SECRET = "whsec_test";
const sign = (body: string) =>
  createHmac("sha256", SECRET).update(body).digest("hex");

describe("Creem webhook signature", () => {
  const body = '{"id":"evt_1","eventType":"subscription.paid","object":{}}';

  it("accepts the hex HMAC-SHA256 of the raw body", () => {
    expect(isValidCreemSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("depends on every byte of the body", () => {
    const reformatted = JSON.stringify(JSON.parse(body), null, 1);
    expect(isValidCreemSignature(reformatted, sign(body), SECRET)).toBe(false);
  });

  it.each(["", "zz", sign("x").slice(0, 10), `${sign("x")}00`])(
    "rejects malformed signature %p without throwing",
    (signature) => {
      expect(isValidCreemSignature("x", signature, SECRET)).toBe(false);
    },
  );
});

describe("Creem webhook payloads", () => {
  it("rejects a body that is not JSON or lacks the envelope fields", () => {
    expect(() => parseCreemEvent("not json")).toThrow();
    expect(() => parseCreemEvent('{"eventType":"x"}')).toThrow();
  });

  it("reads product and customer given as ids or as expanded objects", () => {
    const expanded = parseCreemSubscription({
      id: "sub_1",
      product: { id: "prod_1", name: "Pro" },
      customer: "cust_1",
    });
    expect(referenceId(expanded.product)).toBe("prod_1");
    expect(referenceId(expanded.customer)).toBe("cust_1");
    expect(referenceId(undefined)).toBeNull();
  });
});
