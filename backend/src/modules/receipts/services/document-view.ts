import {
  formatDocumentDateOnly,
  formatDocumentMoney,
} from "../../../common/utils/document-formatting.util";
import { ApiErrors } from "../../../common/errors/ApiError";
import { amountInWords } from "../../../common/utils/amount-in-words.util";
import { calculateVatBreakdown } from "../../../common/utils/vat.util";
import type { DocumentConfig } from "../../settings/document-config";
import { DocumentLanguage, specFor } from "../document-types";
import { DocumentType } from "../entities/receipt.entity";
import type { FrozenDocument } from "../frozen-document";
import {
  DOCUMENT_LABELS,
  DocumentLabels,
  STYLE_LABEL_OVERRIDES,
  TAX_ID_LABELS,
} from "../templates/translations/document-labels";

/** The part of a frozen order the document blocks read. */
export type DocumentOrderInput = {
  currency: string;
  total_cents: number;
  recipient: { address?: string };
  items: ReadonlyArray<{ line_total_cents: number }>;
};

type PartyView = {
  role: string;
  name: string;
  codeLabel: string;
  code: string;
  address: string;
  /** Seller only: "ІПН …" for a VAT payer, a non-payer note, nothing when unknown. */
  vatLine: string;
};

type SignatoryView = { heading: string; position: string; name: string };

/**
 * Pre-formatted values for the invoice/act blocks. Templates read only these flags and
 * strings (`payment`, `act`, `signatures.buyer`); they never look at the document type.
 */
export type DocumentView = {
  labels: DocumentLabels;
  seller: PartyView;
  buyer: PartyView;
  /** Invoice only. */
  payment?: {
    recipient: string;
    iban: string;
    bank: string;
    purpose: string;
  };
  totals: {
    total: string;
    vat?: { label: string; amount: string };
    noVat?: string;
    grandTotal: string;
    amountInWords: string;
  };
  /** Invoice only. */
  dueDate?: string;
  /** Act only. */
  act?: { statement: string; contractRef?: string; period?: string };
  signatures: { seller: SignatoryView; buyer?: SignatoryView };
};

export type DocumentRenderData = {
  view: DocumentView;
  /** Merged over the style's translations so receipt-only wording does not leak in. */
  translationOverrides: Record<string, string>;
  /** Company fields blanked in the style header: the blocks print them themselves. */
  headerCompany: { companyTaxId: ""; companyIban: ""; companySwift: "" };
  /** Issue date as a calendar date, replacing the order date. */
  orderDate: string;
};

function languageOf(config: DocumentConfig): DocumentLanguage {
  const language = config.documentLanguage;
  return language === "uk" || language === "ru" ? language : "en";
}

function assertTotalsAgree(order: DocumentOrderInput): void {
  const linesTotal = order.items.reduce(
    (sum, item) => sum + item.line_total_cents,
    0,
  );
  if (linesTotal !== order.total_cents)
    throw ApiErrors.INTERNAL_SERVER_ERROR("Document totals are inconsistent");
}

const joined = (...parts: string[]) => parts.filter(Boolean).join(" ");

export function buildDocumentRenderData(
  frozen: FrozenDocument,
  order: DocumentOrderInput,
  number: string,
  config: DocumentConfig,
): DocumentRenderData {
  assertTotalsAgree(order);
  const language = languageOf(config);
  const labels = DOCUMENT_LABELS[language];
  const layout = specFor(frozen.type).layout;
  if (!layout) throw new Error(`Document type ${frozen.type} has no layout`);
  const { seller, buyer, details } = frozen;
  const day = (value: string) =>
    formatDocumentDateOnly(value, language, config.formatting);
  const money = (cents: number) =>
    formatDocumentMoney(cents, order.currency, config.formatting);
  const taxLabel = (kind: "edrpou" | "rnokpp" | null) =>
    kind ? TAX_ID_LABELS[language][kind] : "";

  const issueDate = day(frozen.issueDate);
  const rate = frozen.vatRatePercent;
  const vat =
    seller.vatPayer === true
      ? calculateVatBreakdown(order.total_cents, { mode: "included", rate })
      : undefined;

  const vatLine =
    seller.vatPayer === true
      ? joined(labels.vatId, seller.vatId)
      : seller.vatPayer === false
        ? labels.vatNonPayer
        : "";
  const sellerName = joined(seller.legalForm, seller.name);
  const buyerName = buyer.legalName || buyer.name;

  const purposeVat = vat
    ? `${labels.purposeVat} ${rate}% — ${money(vat.vat)}`
    : seller.vatPayer === false
      ? labels.purposeNoVat
      : "";
  const purpose =
    joined(labels.purposePrefix, number, labels.purposeFrom, issueDate) +
    (purposeVat ? `, ${purposeVat}` : "");

  const view: DocumentView = {
    labels,
    seller: {
      role: labels[layout.sellerRole],
      name: sellerName,
      codeLabel: taxLabel(seller.taxIdKind),
      code: seller.taxId,
      address: seller.address,
      vatLine,
    },
    buyer: {
      role: labels[layout.buyerRole],
      name: buyerName,
      codeLabel: taxLabel(buyer.taxIdKind),
      code: buyer.taxId,
      address: buyer.legalAddress || order.recipient.address || "",
      vatLine: "",
    },
    ...(layout.payment
      ? {
          payment: {
            recipient: sellerName,
            iban: seller.iban,
            bank: seller.bankName,
            purpose,
          },
        }
      : {}),
    totals: {
      total: money(order.total_cents),
      ...(vat
        ? {
            vat: {
              label: `${labels.vatIncluded} (${rate}%)`,
              amount: money(vat.vat),
            },
          }
        : {}),
      ...(seller.vatPayer === false ? { noVat: labels.noVat } : {}),
      grandTotal: money(order.total_cents),
      amountInWords: amountInWords(order.total_cents, order.currency, language),
    },
    ...(details.dueDate ? { dueDate: day(details.dueDate) } : {}),
    ...(layout.completionStatement
      ? {
          act: {
            statement: labels.actStatement,
            ...(details.contractRef
              ? { contractRef: details.contractRef }
              : {}),
            ...(details.period
              ? {
                  period: `${day(details.period.from)} – ${day(details.period.to)}`,
                }
              : {}),
          },
        }
      : {}),
    signatures: {
      seller: {
        heading: layout.completionStatement
          ? labels.fromContractor
          : labels.issuedBy,
        position: seller.signatoryPosition,
        name: seller.signatoryName,
      },
      ...(layout.buyerSignature
        ? {
            buyer: {
              heading: labels.fromCustomer,
              position: "",
              name: buyerName,
            },
          }
        : {}),
    },
  };

  const overrides =
    STYLE_LABEL_OVERRIDES[frozen.type === DocumentType.ACT ? "act" : "invoice"][
      language
    ];
  const vatHeaders =
    seller.vatPayer === true
      ? {
          price: labels.priceWithVat,
          unitPrice: labels.priceWithVat,
          rate: labels.priceWithVat,
          amount: labels.amountWithVat,
        }
      : {};

  return {
    view,
    translationOverrides: { ...overrides, ...vatHeaders },
    headerCompany: { companyTaxId: "", companyIban: "", companySwift: "" },
    orderDate: issueDate,
  };
}
