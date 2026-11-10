import { ApiErrors } from "../../common/errors/ApiError";
import { specFor } from "./document-types";
import { DocumentType } from "./entities/receipt.entity";
import { getTemplateCapabilities } from "./templates/metadata";

/**
 * Only styles that carry the document blocks (`layout.allowedStyles`) may render a typed
 * document; on top of that, a style that prints no amounts cannot carry amounts and an
 * invoice needs a style that can show the seller's IBAN. Checked before a number is allocated.
 */
export function assertTemplateSupportsDocument(
  type: DocumentType,
  templateId: string,
): void {
  const spec = specFor(type);
  if (spec.layout && !spec.layout.allowedStyles.includes(templateId))
    throw ApiErrors.DOCUMENT_TEMPLATE_UNSUPPORTED(type, templateId);
  const caps = getTemplateCapabilities(templateId);
  const needsIban = spec.requiredSeller.includes("iban");
  if (
    (spec.requiresMoney && !caps.money) ||
    (needsIban && !caps.companyFields.includes("companyIban"))
  )
    throw ApiErrors.DOCUMENT_TEMPLATE_UNSUPPORTED(type, templateId);
}
