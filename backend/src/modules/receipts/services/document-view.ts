import {
  formatDocumentDateOnly,
  formatDocumentMoney,
} from "../../../common/utils/document-formatting.util";
import { ApiErrors } from "../../../common/errors/ApiError";
import { amountInWords } from "../../../common/utils/amount-in-words.util";
import { calculateVatBreakdown } from "../../../common/utils/vat.util";
import type { DocumentConfig } from "../../settings/document-config";
import { DocumentLanguage, specFor } from "../document-types";
import type { DocumentType } from "../entities/receipt.entity";
import type { FrozenDocument } from "../frozen-document";
import type { ReturnSource } from "../return-note";
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
  items: ReadonlyArray<{ qty: number; line_total_cents: number }>;
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

type SignatoryView = {
  heading: string;
  position: string;
  name: string;
  /** Seller only: the account's signature image as a data URI. */
  image?: string;
};

/** Signature and stamp as data URIs, built on the server and never from user input. */
export type SignoffImages = { signature?: string; stamp?: string };

/** Packing list summary under the items: how many lines and how many pieces in all. */
type QuantitiesView = { lines: string; units: string };

/**
 * Pre-formatted values for the document blocks. Templates read only these flags and
 * strings (`payment`, `act`, `totals`, `signatures.buyer`); they never look at the
 * document type.
 */
export type DocumentView = {
  /** The shared labels, with the grand total line renamed for types that ask for it. */
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
  /** Heading-level notice above the parties (sales receipt: not fiscal; quotation: not an invoice). */
  notice?: string;
  /** The items table drops its price and amount columns. */
  hidesItemPrices?: true;
  /** Absent for a document that prints no money. */
  totals?: {
    total: string;
    vat?: { label: string; amount: string };
    noVat?: string;
    grandTotal: string;
    amountInWords: string;
  };
  /** Present instead of `totals` for a document without money. */
  quantities?: QuantitiesView;
  /** Invoice only. */
  dueDate?: string;
  /** Quotation only: how long the offer stands and the terms attached to it. */
  offer?: { validUntil: string; paymentTerms?: string; deliveryTerms?: string };
  /** Return note only: what the goods are returned against, and why. */
  returnInfo?: { source: string; reason?: string };
  /** Act only. */
  act?: { statement: string; contractRef?: string; period?: string };
  signatures: {
    seller: SignatoryView;
    buyer?: SignatoryView;
    /** "Signature / Seal" or just "Signature", per the layout. */
    caption: string;
    /** Only for a layout that carries a stamp (invoice, act, quotation). */
    stampImage?: string;
    /** Set when any image is present, to switch on the image CSS. */
    hasImages?: true;
  };
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

export function languageOf(config: DocumentConfig): DocumentLanguage {
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

function styleLabelOverrides(type: DocumentType, language: DocumentLanguage) {
  if (!(type in STYLE_LABEL_OVERRIDES))
    throw new Error(`Document type ${type} has no label set`);
  return STYLE_LABEL_OVERRIDES[type as keyof typeof STYLE_LABEL_OVERRIDES][
    language
  ];
}

const RETURN_SOURCE_LABELS = {
  waybill: "returnSourceWaybill",
  invoice: "returnSourceInvoice",
  order: "returnSourceOrder",
} as const;

/** The source's own printed heading plus its number sign, else the generic label. */
function returnSourceHeading(
  source: ReturnSource,
  labels: DocumentLabels,
  language: DocumentLanguage,
): string {
  if (!source.title) return labels[RETURN_SOURCE_LABELS[source.kind]];
  const sign = language === "en" ? "No." : "№";
  // A custom title may already end in a number sign ("Накладна №", "Invoice No.", "Nr").
  return /(№|(?:^|\s)(?:no|nr)\.?)\s*$/i.test(source.title)
    ? source.title
    : `${source.title} ${sign}`;
}

const joined = (...parts: string[]) => parts.filter(Boolean).join(" ");

export function buildDocumentRenderData(
  frozen: FrozenDocument,
  order: DocumentOrderInput,
  number: string,
  config: DocumentConfig,
  signoff: SignoffImages = {},
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

  const stampImage = layout.signatures.stamp ? signoff.stamp : undefined;

  const view: DocumentView = {
    labels: layout.grandTotalLabel
      ? { ...labels, grandTotal: labels[layout.grandTotalLabel] }
      : labels,
    seller: {
      role: labels[layout.sellerRole],
      name: sellerName,
      codeLabel: taxLabel(seller.taxIdKind),
      // A code whose kind is unknown is not printed under a label it cannot have.
      code: seller.taxIdKind ? seller.taxId : "",
      address: seller.address,
      vatLine: layout.money ? vatLine : "",
    },
    buyer: {
      role: labels[layout.buyerRole],
      name: buyerName,
      codeLabel: taxLabel(buyer.taxIdKind),
      code: buyer.taxIdKind ? buyer.taxId : "",
      address:
        layout.buyerAddress === "delivery"
          ? order.recipient.address || buyer.legalAddress
          : buyer.legalAddress || order.recipient.address || "",
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
    ...(layout.notice ? { notice: labels[layout.notice] } : {}),
    ...(layout.money
      ? {
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
            amountInWords: amountInWords(
              order.total_cents,
              order.currency,
              language,
            ),
          },
        }
      : {
          hidesItemPrices: true as const,
          quantities: {
            lines: String(order.items.length),
            units: String(order.items.reduce((sum, item) => sum + item.qty, 0)),
          },
        }),
    ...(details.dueDate ? { dueDate: day(details.dueDate) } : {}),
    ...(details.validUntil
      ? {
          offer: {
            validUntil: day(details.validUntil),
            ...(details.paymentTerms
              ? { paymentTerms: details.paymentTerms }
              : {}),
            ...(details.deliveryTerms
              ? { deliveryTerms: details.deliveryTerms }
              : {}),
          },
        }
      : {}),
    ...(details.returnSource
      ? {
          returnInfo: {
            source: joined(
              returnSourceHeading(details.returnSource, labels, language),
              details.returnSource.number,
              labels.purposeFrom,
              day(details.returnSource.date),
            ),
            ...(details.returnReason ? { reason: details.returnReason } : {}),
          },
        }
      : {}),
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
        heading: labels[layout.signatures.seller],
        position: seller.signatoryPosition,
        name: seller.signatoryName,
        ...(signoff.signature ? { image: signoff.signature } : {}),
      },
      ...(layout.signatures.buyer
        ? {
            buyer: {
              heading: labels[layout.signatures.buyer],
              position: "",
              name: buyerName,
            },
          }
        : {}),
      caption: layout.signatures.stamp
        ? `${labels.signature} / ${labels.stamp}`
        : labels.signature,
      ...(stampImage ? { stampImage } : {}),
      ...(signoff.signature || stampImage ? { hasImages: true as const } : {}),
    },
  };

  const overrides = styleLabelOverrides(frozen.type, language);
  const vatHeaders =
    layout.money && seller.vatPayer === true
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
