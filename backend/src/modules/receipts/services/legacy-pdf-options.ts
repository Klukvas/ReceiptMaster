import { ConflictException } from "@nestjs/common";
import { PdfOptions } from "./playwright-pdf-generator.service";
/** Known pre-configuration renderer profile; deliberately independent of future metadata. */
export function legacyPdfOptions(templateId: string): PdfOptions {
  const known = [
    "standard",
    "compact",
    "classic",
    "modern",
    "elegant",
    "vintage",
    "tech",
    "wave",
    "minimal",
    "corporate",
    "thermal",
    "dark",
    "branded",
    "delivery",
    "proforma",
  ];
  if (!known.includes(templateId))
    throw new ConflictException({
      errorCode: "RECONSTRUCTION_REQUIRED",
      message:
        "Legacy PDF profile is unknown; explicitly reconstruct this document.",
    });
  return {
    format: "A4",
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: false,
    ...(templateId === "thermal"
      ? {
          width: "80mm",
          contentBasedHeight: true,
          margin: { top: "3mm", bottom: "3mm", left: "2mm", right: "2mm" },
        }
      : {
          margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
        }),
  };
}
