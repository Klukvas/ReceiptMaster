import { TEMPLATE_METADATA } from "../../receipts/templates/metadata";
import { DocumentType } from "../../receipts/entities/receipt.entity";
import { DEFAULT_TEMPLATE_ID, PLAN_LIMITS, PlanFeature } from "./plans.config";

const templateIds = Object.keys(TEMPLATE_METADATA);

describe("plan table", () => {
  it("names only templates and document types that exist", () => {
    for (const limits of Object.values(PLAN_LIMITS)) {
      for (const id of limits.allowedTemplateIds ?? [])
        expect(templateIds).toContain(id);
      for (const type of limits.allowedDocumentTypes ?? [])
        expect(Object.values(DocumentType)).toContain(type);
    }
  });

  it("gives every plan the fallback template and the waybill the auto-receipt issues", () => {
    for (const limits of Object.values(PLAN_LIMITS)) {
      expect(limits.allowedTemplateIds ?? templateIds).toContain(
        DEFAULT_TEMPLATE_ID,
      );
      expect(
        limits.allowedDocumentTypes ?? Object.values(DocumentType),
      ).toContain(DocumentType.WAYBILL);
    }
  });

  it("never gives a higher plan less than the one below it", () => {
    const { free, pro, business } = PLAN_LIMITS;
    const atLeast = (higher: number | null, lower: number | null) =>
      higher === null || (lower !== null && higher >= lower);

    for (const [lower, higher] of [
      [free, pro],
      [pro, business],
    ]) {
      expect(atLeast(higher.maxProducts, lower.maxProducts)).toBe(true);
      expect(atLeast(higher.maxRecipients, lower.maxRecipients)).toBe(true);
      expect(atLeast(higher.maxOrdersPerMonth, lower.maxOrdersPerMonth)).toBe(
        true,
      );
      expect(
        atLeast(
          higher.documentsRetainedPerType,
          lower.documentsRetainedPerType,
        ),
      ).toBe(true);
      expect(higher.maxPresets).toBeGreaterThanOrEqual(lower.maxPresets);
      for (const id of lower.allowedTemplateIds ?? templateIds)
        expect(higher.allowedTemplateIds ?? templateIds).toContain(id);
      for (const feature of Object.keys(lower.features) as PlanFeature[])
        if (lower.features[feature])
          expect(higher.features[feature]).toBe(true);
    }
  });

  it("matches the published grid: 1, 10 and all 15 templates; 10, 100 and all documents", () => {
    expect(PLAN_LIMITS.free.allowedTemplateIds).toHaveLength(1);
    expect(PLAN_LIMITS.pro.allowedTemplateIds).toHaveLength(10);
    expect(PLAN_LIMITS.business.allowedTemplateIds).toBeNull();
    expect(templateIds).toHaveLength(15);
    expect([
      PLAN_LIMITS.free.documentsRetainedPerType,
      PLAN_LIMITS.pro.documentsRetainedPerType,
      PLAN_LIMITS.business.documentsRetainedPerType,
    ]).toEqual([10, 100, null]);
  });
});
