import { PlanLimits } from "../../subscription/config/plans.config";

/** What a plan lets a document carry of the account's own identity. */
export interface PlanBranding {
  allowsLogo: boolean;
  allowsSignoff: boolean;
  hasAttribution: boolean;
}

/** For callers that render outside any plan (tests, internal tools). */
export const FULL_BRANDING: PlanBranding = {
  allowsLogo: true,
  allowsSignoff: true,
  hasAttribution: false,
};

export function planBranding(limits: PlanLimits): PlanBranding {
  return {
    allowsLogo: limits.features.logo,
    allowsSignoff: limits.features.signoff,
    hasAttribution: limits.hasAttribution,
  };
}

const ATTRIBUTION_TEXT: Readonly<Record<string, string>> = {
  en: "Made with ReceiptMaster · receiptmaster.org",
  uk: "Створено в ReceiptMaster · receiptmaster.org",
  ru: "Создано в ReceiptMaster · receiptmaster.org",
};

// Styled inline: the fifteen templates share no footer partial, and each one's own
// footer can be hidden, so the line must not depend on any template's stylesheet.
const ATTRIBUTION_STYLE =
  "margin:12px 0 0;text-align:center;font:9px/1.4 Arial,Helvetica,sans-serif;" +
  "color:#8a8a8a;break-inside:avoid;page-break-inside:avoid";

/** Adds the line as the last thing in the document body. */
export function withAttribution(html: string, language: string): string {
  const text = ATTRIBUTION_TEXT[language] ?? ATTRIBUTION_TEXT.en;
  const line = `<div class="rm-attribution" style="${ATTRIBUTION_STYLE}">${text}</div>`;
  const bodyEnd = html.lastIndexOf("</body>");
  return bodyEnd === -1
    ? `${html}${line}`
    : `${html.slice(0, bodyEnd)}${line}${html.slice(bodyEnd)}`;
}
