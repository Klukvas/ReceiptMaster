import type { DocumentLanguage } from "../../document-types";

/** Wording of the invoice / act blocks. Key parity across languages is a compile-time check. */
export type DocumentLabels = {
  supplier: string;
  contractor: string;
  payer: string;
  customer: string;
  paymentDetails: string;
  paymentRecipient: string;
  bank: string;
  iban: string;
  purpose: string;
  /** Pieces of the payment purpose: "<prefix> <number> <from> <date>". */
  purposePrefix: string;
  purposeFrom: string;
  purposeVat: string;
  purposeNoVat: string;
  total: string;
  vatIncluded: string;
  noVat: string;
  grandTotal: string;
  amountInWords: string;
  dueDate: string;
  contract: string;
  period: string;
  issuedBy: string;
  fromContractor: string;
  fromCustomer: string;
  signature: string;
  stamp: string;
  actStatement: string;
  vatId: string;
  vatNonPayer: string;
  priceWithVat: string;
  amountWithVat: string;
};

export const DOCUMENT_LABELS = {
  uk: {
    supplier: "Постачальник",
    contractor: "Виконавець",
    payer: "Платник",
    customer: "Замовник",
    paymentDetails: "Реквізити для оплати",
    paymentRecipient: "Одержувач",
    bank: "Банк",
    iban: "IBAN",
    purpose: "Призначення платежу",
    purposePrefix: "Оплата за рахунком №",
    purposeFrom: "від",
    purposeVat: "у т.ч. ПДВ",
    purposeNoVat: "без ПДВ",
    total: "Разом",
    vatIncluded: "У тому числі ПДВ",
    noVat: "Без ПДВ",
    grandTotal: "Всього до сплати",
    amountInWords: "Сума прописом",
    dueDate: "Сплатити до",
    contract: "Договір",
    period: "Період",
    issuedBy: "Виписав(ла)",
    fromContractor: "Від Виконавця",
    fromCustomer: "Від Замовника",
    signature: "Підпис",
    stamp: "М.П.",
    actStatement:
      "Роботи виконано в повному обсязі, сторони претензій одна до одної не мають.",
    vatId: "ІПН",
    vatNonPayer: "Не є платником ПДВ",
    priceWithVat: "Ціна з ПДВ",
    amountWithVat: "Сума з ПДВ",
  },
  ru: {
    supplier: "Поставщик",
    contractor: "Исполнитель",
    payer: "Плательщик",
    customer: "Заказчик",
    paymentDetails: "Реквизиты для оплаты",
    paymentRecipient: "Получатель",
    bank: "Банк",
    iban: "IBAN",
    purpose: "Назначение платежа",
    purposePrefix: "Оплата по счёту №",
    purposeFrom: "от",
    purposeVat: "в т.ч. НДС",
    purposeNoVat: "без НДС",
    total: "Итого",
    vatIncluded: "В том числе НДС",
    noVat: "Без НДС",
    grandTotal: "Всего к оплате",
    amountInWords: "Сумма прописью",
    dueDate: "Оплатить до",
    contract: "Договор",
    period: "Период",
    issuedBy: "Выписал(а)",
    fromContractor: "От Исполнителя",
    fromCustomer: "От Заказчика",
    signature: "Подпись",
    stamp: "М.П.",
    actStatement:
      "Работы выполнены в полном объёме, стороны претензий друг к другу не имеют.",
    vatId: "ИНН плательщика НДС",
    vatNonPayer: "Не является плательщиком НДС",
    priceWithVat: "Цена с НДС",
    amountWithVat: "Сумма с НДС",
  },
  en: {
    supplier: "Supplier",
    contractor: "Contractor",
    payer: "Payer",
    customer: "Customer",
    paymentDetails: "Payment details",
    paymentRecipient: "Beneficiary",
    bank: "Bank",
    iban: "IBAN",
    purpose: "Payment reference",
    purposePrefix: "Payment for invoice No.",
    purposeFrom: "dated",
    purposeVat: "incl. VAT",
    purposeNoVat: "VAT not applicable",
    total: "Subtotal",
    vatIncluded: "VAT included",
    noVat: "No VAT",
    grandTotal: "Total due",
    amountInWords: "Amount in words",
    dueDate: "Pay by",
    contract: "Contract",
    period: "Period",
    issuedBy: "Issued by",
    fromContractor: "On behalf of the Contractor",
    fromCustomer: "On behalf of the Customer",
    signature: "Signature",
    stamp: "Seal",
    actStatement:
      "The work has been completed in full; the parties have no claims against each other.",
    vatId: "VAT ID",
    vatNonPayer: "Not a VAT payer",
    priceWithVat: "Price incl. VAT",
    amountWithVat: "Amount incl. VAT",
  },
} satisfies Record<DocumentLanguage, DocumentLabels>;

export const TAX_ID_LABELS: Record<
  DocumentLanguage,
  Record<"edrpou" | "rnokpp", string>
> = {
  uk: { edrpou: "ЄДРПОУ", rnokpp: "РНОКПП" },
  ru: { edrpou: "ЕГРПОУ", rnokpp: "РНОКПП" },
  en: { edrpou: "EDRPOU", rnokpp: "RNOKPP" },
};

export type StyleLabelOverrides = Record<
  "invoiceNo" | "invoiceDate" | "generatedAt" | "thankYou" | "footerMessage",
  string
>;

/**
 * Labels the styles define for a receipt ("Receipt generated", "Thank you for your
 * purchase") that would be wrong on an invoice or an act.
 */
export const STYLE_LABEL_OVERRIDES: Record<
  "invoice" | "act",
  Record<DocumentLanguage, StyleLabelOverrides>
> = {
  invoice: {
    uk: {
      invoiceNo: "Номер рахунку:",
      invoiceDate: "Дата рахунку:",
      generatedAt: "Рахунок сформовано:",
      thankYou: "Дякуємо за співпрацю!",
      footerMessage: "Якщо у вас є питання, будь ласка, зв’яжіться з нами.",
    },
    ru: {
      invoiceNo: "Номер счёта:",
      invoiceDate: "Дата счёта:",
      generatedAt: "Счёт сформирован:",
      thankYou: "Благодарим за сотрудничество!",
      footerMessage: "Если у вас есть вопросы, пожалуйста, свяжитесь с нами.",
    },
    en: {
      invoiceNo: "Invoice No:",
      invoiceDate: "Invoice date:",
      generatedAt: "Invoice generated:",
      thankYou: "Thank you for your business!",
      footerMessage: "If you have any questions, please contact us.",
    },
  },
  act: {
    uk: {
      invoiceNo: "Номер акта:",
      invoiceDate: "Дата акта:",
      generatedAt: "Акт сформовано:",
      thankYou: "Дякуємо за співпрацю!",
      footerMessage: "Якщо у вас є питання, будь ласка, зв’яжіться з нами.",
    },
    ru: {
      invoiceNo: "Номер акта:",
      invoiceDate: "Дата акта:",
      generatedAt: "Акт сформирован:",
      thankYou: "Благодарим за сотрудничество!",
      footerMessage: "Если у вас есть вопросы, пожалуйста, свяжитесь с нами.",
    },
    en: {
      invoiceNo: "Act No:",
      invoiceDate: "Act date:",
      generatedAt: "Act generated:",
      thankYou: "Thank you for your business!",
      footerMessage: "If you have any questions, please contact us.",
    },
  },
};
