import { ApiErrorResponse } from "../../../common/errors/ApiError";
import { numberingUpdateRequestSchema } from "../../../openapi/api-components";
import { parseUpdateNumbering } from "./update-numbering.dto";

const valid = { prefix: "INV-", padding: 6, includeYear: true };

function refusal(body: unknown): ApiErrorResponse {
  try {
    parseUpdateNumbering(body);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiErrorResponse);
    return error as ApiErrorResponse;
  }
  throw new Error("expected a refusal");
}

describe("parseUpdateNumbering", () => {
  it("accepts the defaults and a typical custom format", () => {
    expect(parseUpdateNumbering({ ...valid, prefix: "" })).toMatchObject({
      prefix: "",
    });
    expect(
      parseUpdateNumbering({ ...valid, prefix: "РФ-", startNumber: 100 }),
    ).toMatchObject({ prefix: "РФ-", startNumber: 100 });
  });

  it("trims the prefix", () => {
    expect(parseUpdateNumbering({ ...valid, prefix: "  AB  " }).prefix).toBe(
      "AB",
    );
  });

  it.each([
    ["ends with a digit", "INV1"],
    ["ends with a digit after a separator", "A-2"],
    ["contains a slash", "A/B"],
    ["contains a backslash", "A\\B"],
    ["contains a quote", 'A"B'],
    ["contains a control character", "A\tB"],
    ["contains a newline", "A\nB"],
    ["is longer than 16 characters", "ABCDEFGHIJKLMNOPQ"],
    ["contains markup", "<b>"],
    ["contains a percent sign", "50%"],
  ])("refuses a prefix that %s", (_name, prefix) => {
    const error = refusal({ ...valid, prefix });
    expect(error).toMatchObject({
      statusCode: 400,
      errorCode: "VALIDATION_ERROR",
    });
    expect(error.message).toContain("prefix");
  });

  it("accepts exactly 16 characters", () => {
    expect(
      parseUpdateNumbering({ ...valid, prefix: "A".repeat(16) }).prefix,
    ).toHaveLength(16);
  });

  it.each([0, 10, 1.5, "6", null])("refuses padding %p", (padding) => {
    expect(refusal({ ...valid, padding }).message).toContain("padding");
  });

  it.each([1, 9])("accepts padding %d", (padding) => {
    expect(parseUpdateNumbering({ ...valid, padding }).padding).toBe(padding);
  });

  it.each([0, -5, 2_000_000_001, 1.5, "5"])(
    "refuses startNumber %p",
    (startNumber) => {
      expect(refusal({ ...valid, startNumber }).message).toContain(
        "startNumber",
      );
    },
  );

  it("accepts the largest startNumber", () => {
    expect(
      parseUpdateNumbering({ ...valid, startNumber: 2_000_000_000 })
        .startNumber,
    ).toBe(2_000_000_000);
  });

  it("requires includeYear to be a boolean", () => {
    expect(refusal({ ...valid, includeYear: "yes" }).message).toContain(
      "includeYear",
    );
    expect(refusal({ prefix: "", padding: 6 }).message).toContain(
      "includeYear",
    );
  });

  it.each([undefined, null, "text", []])("refuses the body %p", (body) => {
    expect(refusal(body).errorCode).toBe("VALIDATION_ERROR");
  });
});

describe("NumberingUpdateRequest documentation", () => {
  it("states the same limits the validator enforces", () => {
    const shape = numberingUpdateRequestSchema.shape;
    expect(shape.prefix.maxLength).toBe(16);
    expect(shape.padding.minValue).toBe(1);
    expect(shape.padding.maxValue).toBe(9);
    expect(shape.startNumber.unwrap().minValue).toBe(1);
    expect(shape.startNumber.unwrap().maxValue).toBe(2_000_000_000);
  });
});
