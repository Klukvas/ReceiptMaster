import { OpenAPIObject } from "@nestjs/swagger";
import { documentConfigSchema } from "../modules/settings/document-config";
import {
  Receipt,
  DocumentType,
  ReceiptStatus,
} from "../modules/receipts/entities/receipt.entity";
import {
  documentListItem,
  issuedDocument,
  receiptProjection,
} from "../modules/receipts/services/receipt-projection";
import {
  PRIMARY_COLOR_PATTERN,
  SHARED_SCHEMAS,
  documentListItemSchema,
  receiptIssueResultSchema,
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
      document_type: DocumentType.WAYBILL,
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

  it("documents what issuedDocument() adds: warnings only when there are some", () => {
    const base = {
      id: "0b8c6f35-6cc4-4c2a-9b2c-6f7e0c1d2e3f",
      order_id: "1c9d7a46-7dd5-4d3b-8c3d-7a8f1d2e3f40",
      document_type: DocumentType.INVOICE,
      number: "2026-000001",
      pdf_url: null,
      hash: null,
      status: ReceiptStatus.PROCESSING,
      template_id: "standard",
      template_version: 1,
      progress: 0,
      error_message: null,
      created_at: new Date("2026-10-29T10:00:00Z"),
      voided_at: null,
      void_reason: null,
      public_token: null,
      active_revision: 0,
      replacement_status: null,
      replacement_error: null,
    } as unknown as Receipt;
    const warned = {
      ...base,
      warnings: [
        {
          code: "SIGNOFF_UNAVAILABLE" as const,
          kinds: ["signature" as const],
          message: "The signature or stamp image could not be read.",
        },
      ],
    } as Receipt;

    const plain = JSON.parse(JSON.stringify(issuedDocument(base)));
    const withWarning = JSON.parse(JSON.stringify(issuedDocument(warned)));

    expect(plain).not.toHaveProperty("warnings");
    expect(Object.keys(plain).sort()).toEqual(
      Object.keys(receiptProjectionSchema.shape).sort(),
    );
    expect(receiptIssueResultSchema.safeParse(plain).success).toBe(true);
    expect(receiptIssueResultSchema.safeParse(withWarning).success).toBe(true);
    expect(withWarning.warnings).toHaveLength(1);
    expect(
      issuedDocument({ ...base, warnings: [] } as Receipt),
    ).not.toHaveProperty("warnings");
  });

  it("documents exactly what documentListItem() puts on the wire, and only adds `order`", () => {
    const receipt = {
      id: "0b8c6f35-6cc4-4c2a-9b2c-6f7e0c1d2e3f",
      order_id: "1c9d7a46-7dd5-4d3b-8c3d-7a8f1d2e3f40",
      document_type: DocumentType.INVOICE,
      number: "РФ-2026-000001",
      pdf_url: null,
      hash: null,
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
      order: {
        id: "1c9d7a46-7dd5-4d3b-8c3d-7a8f1d2e3f40",
        order_number: 12,
        status: "confirmed",
        total_cents: 99999,
        recipient: { name: "Acme", email: "private@acme.test" },
      },
    } as unknown as Receipt;

    const wire = JSON.parse(JSON.stringify(documentListItem(receipt)));
    const { order, ...projection } = wire;

    expect(Object.keys(wire).sort()).toEqual(
      Object.keys(documentListItemSchema.shape).sort(),
    );
    expect(documentListItemSchema.safeParse(wire).success).toBe(true);
    expect(projection).toEqual(
      JSON.parse(JSON.stringify(receiptProjection(receipt))),
    );
    // Nothing of the order beyond the four documented fields, no recipient contacts.
    expect(order).toEqual({
      id: "1c9d7a46-7dd5-4d3b-8c3d-7a8f1d2e3f40",
      order_number: 12,
      status: "confirmed",
      recipient_name: "Acme",
    });
    expect(
      documentListItemSchema.safeParse({ ...wire, order: null }).success,
    ).toBe(true);
    expect(
      JSON.stringify(
        documentListItem({ ...receipt, order: undefined } as never),
      ),
    ).toContain('"order":null');
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
