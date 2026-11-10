import { ApiErrorResponse } from "../../common/errors/ApiError";
import { parseOrderListFilters } from "./order-list-filters";

const noDates = {};
const UUID = "6f1d2c1e-7a53-4f43-9f3a-2f6a1c9a0b11";

const refusal = (query: Parameters<typeof parseOrderListFilters>[1]) => {
  try {
    parseOrderListFilters(noDates, query);
  } catch (error) {
    return error as ApiErrorResponse;
  }
  throw new Error("expected a refusal");
};

describe("parseOrderListFilters", () => {
  it("reads whole cents and a product id", () => {
    expect(
      parseOrderListFilters(noDates, {
        minAmount: "0",
        maxAmount: "2147483647",
        productId: UUID,
      }),
    ).toMatchObject({ minAmount: 0, maxAmount: 2147483647, productId: UUID });
  });

  it("treats absent and empty values as no filter", () => {
    expect(
      parseOrderListFilters(noDates, {
        minAmount: "",
        maxAmount: undefined,
        productId: "",
      }),
    ).toEqual({
      startDate: undefined,
      endDate: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      productId: undefined,
    });
  });

  it.each(["abc", "-1", "1.5", "1e3", " 7", "2147483648", "NaN"])(
    "refuses the amount %p with a 400 naming the field",
    (value) => {
      for (const field of ["minAmount", "maxAmount"] as const) {
        const error = refusal({ [field]: value });
        expect(error).toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect(error.message).toContain(field);
      }
    },
  );

  it("reads a known status and treats an empty one as no filter", () => {
    expect(parseOrderListFilters(noDates, { status: "confirmed" }).status).toBe(
      "confirmed",
    );
    expect(
      parseOrderListFilters(noDates, { status: "" }).status,
    ).toBeUndefined();
  });

  it.each(["foo", "CONFIRMED", "draft,confirmed", "__proto__"])(
    "refuses the status %p with a 400 naming the field",
    (status) => {
      const error = refusal({ status });
      expect(error).toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
      });
      expect(error.message).toContain("status");
    },
  );

  it.each(["not-a-uuid", "1", "6f1d2c1e-7a53-4f43-9f3a"])(
    "refuses the product id %p with a 400",
    (productId) => {
      const error = refusal({ productId });
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("productId");
    },
  );
});
