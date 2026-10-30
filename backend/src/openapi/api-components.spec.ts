import { OpenAPIObject } from "@nestjs/swagger";
import { documentConfigSchema } from "../modules/settings/document-config";
import {
  Receipt,
  ReceiptStatus,
} from "../modules/receipts/entities/receipt.entity";
import { receiptProjection } from "../modules/receipts/services/receipt-projection";
import {
  PRIMARY_COLOR_PATTERN,
  SHARED_SCHEMAS,
  receiptProjectionSchema,
  sharedComponents,
} from "./api-components";
import { unresolvedSchemaRefs, withSharedComponents } from "./openapi-document";

const emptyDocument = (schemas: Record<string, unknown>): OpenAPIObject => ({
  openapi: "3.0.0",
  info: { title: "test", version: "1" },
  paths: {},
  components: { schemas },
});

describe("shared OpenAPI components", () => {
  it("converts every registered schema and resolves every reference", () => {
    const components = sharedComponents();
    expect(Object.keys(components)).toEqual(Object.keys(SHARED_SCHEMAS));
    expect(unresolvedSchemaRefs(emptyDocument(components))).toEqual([]);
  });

  it("documents exactly what receiptProjection() puts on the wire", () => {
    const receipt = {
      id: "0b8c6f35-6cc4-4c2a-9b2c-6f7e0c1d2e3f",
      order_id: "1c9d7a46-7dd5-4d3b-8c3d-7a8f1d2e3f40",
      number: "2026-000001",
      pdf_url: null,
      hash: "abc",
      status: ReceiptStatus.GENERATED,
      template_id: "standard",
      template_version: 1,
      progress: 100,
      error_message: null,
      created_at: new Date("2026-10-29T10:00:00Z"),
      voided_at: null,
      void_reason: null,
      public_token: null,
      active_revision: 1,
      replacement_status: null,
      replacement_error: null,
      html_snapshot: "<private>",
      user_id: "private",
    } as unknown as Receipt;
    const wire = JSON.parse(JSON.stringify(receiptProjection(receipt)));
    expect(Object.keys(wire).sort()).toEqual(
      Object.keys(receiptProjectionSchema.shape).sort(),
    );
    expect(receiptProjectionSchema.safeParse(wire).success).toBe(true);
  });

  it("documents primaryColor with the same case-insensitive rule Zod applies", () => {
    const pattern = new RegExp(PRIMARY_COLOR_PATTERN);
    const zod = documentConfigSchema.shape.primaryColor;
    for (const value of ["#3B82F6", "#3b82f6", "#3B82F", "3B82F6", "#3B82FG"])
      expect(pattern.test(value)).toBe(zod.safeParse(value).success);
  });
});

describe("withSharedComponents", () => {
  const ref = { $ref: "#/components/schemas/Shared" };

  it("adds shared components next to generated ones", () => {
    const merged = withSharedComponents(
      emptyDocument({ Generated: { type: "object", properties: { s: ref } } }),
      { Shared: { type: "string" } },
    );
    expect(Object.keys(merged.components?.schemas ?? {})).toEqual([
      "Generated",
      "Shared",
    ]);
  });

  it("refuses a name that Swagger already generated", () => {
    expect(() =>
      withSharedComponents(emptyDocument({ Shared: {} }), { Shared: {} }),
    ).toThrow(/clash with generated ones: Shared/);
  });

  it("refuses a reference to a component that does not exist", () => {
    expect(() =>
      withSharedComponents(emptyDocument({}), {
        Holder: { type: "object", properties: { missing: ref } },
      }),
    ).toThrow(/missing components: #\/components\/schemas\/Shared/);
  });
});
