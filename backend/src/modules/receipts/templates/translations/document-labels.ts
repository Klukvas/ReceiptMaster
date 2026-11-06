import type {
  DocumentLanguage,
  GeneratableDocumentType,
} from "../../document-types";
import type { DocumentType } from "../../entities/receipt.entity";

/** Wording of the invoice / act blocks. Key parity across languages is a compile-time check. */
export type DocumentLabels = {
  supplier: string;
  contractor: string;
  seller: string;
  shipper: string;
  payer: string;
  customer: string;
  buyer: string;
  consignee: string;
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
  fromSupplier: string;
  sellerSignature: string;
  shippedBy: string;
  receivedBy: string;
  signature: string;
  stamp: string;
  actStatement: string;
  /** Printed on the sales receipt: the document has no fiscal standing. */
  nonFiscalNotice: string;
  /** Printed on the quotation: it is an offer, not a bill. */
  quoteNotice: string;
  /** Grand total line of the quotation, which is not "due" yet. */
  offerTotal: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  linesCount: string;
  totalQuantity: string;
  vatId: string;
  vatNonPayer: string;
  priceWithVat: string;
  amountWithVat: string;
};

export const DOCUMENT_LABELS = {
  uk: {
    supplier: "Постачальник",
    contractor: "Виконавець",
    seller: "Продавець",
    shipper: "Відправник",
    payer: "Платник",
    customer: "Замовник",
    buyer: "Покупець",
    consignee: "Одержувач",
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
    fromSupplier: "Від Постачальника",
    sellerSignature: "Продавець",
    shippedBy: "Відправив",
    receivedBy: "Отримав",
    signature: "Підпис",
    stamp: "М.П.",
    actStatement:
      "Роботи виконано в повному обсязі, сторони претензій одна до одної не мають.",
    nonFiscalNotice: "Не є фіскальним документом",
    quoteNotice:
      "Пропозиція не є рахунком та не є підставою для оплати або бухгалтерського обліку",
    offerTotal: "Загальна вартість",
    validUntil: "Пропозиція дійсна до",
    paymentTerms: "Умови оплати",
    deliveryTerms: "Умови поставки",
    linesCount: "Найменувань",
    totalQuantity: "Загальна кількість",
    vatId: "ІПН",
    vatNonPayer: "Не є платником ПДВ",
    priceWithVat: "Ціна з ПДВ",
    amountWithVat: "Сума з ПДВ",
  },
  ru: {
    supplier: "Поставщик",
    contractor: "Исполнитель",
    seller: "Продавец",
    shipper: "Отправитель",
    payer: "Плательщик",
    customer: "Заказчик",
    buyer: "Покупатель",
    consignee: "Получатель",
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
    fromSupplier: "От Поставщика",
    sellerSignature: "Продавец",
    shippedBy: "Отправил",
    receivedBy: "Получил",
    signature: "Подпись",
    stamp: "М.П.",
    actStatement:
      "Работы выполнены в полном объёме, стороны претензий друг к другу не имеют.",
    nonFiscalNotice: "Не является фискальным документом",
    quoteNotice:
      "Предложение не является счётом и не является основанием для оплаты или бухгалтерского учёта",
    offerTotal: "Общая стоимость",
    validUntil: "Предложение действительно до",
    paymentTerms: "Условия оплаты",
    deliveryTerms: "Условия поставки",
    linesCount: "Наименований",
    totalQuantity: "Общее количество",
    vatId: "ИНН плательщика НДС",
    vatNonPayer: "Не является плательщиком НДС",
    priceWithVat: "Цена с НДС",
    amountWithVat: "Сумма с НДС",
  },
  en: {
    supplier: "Supplier",
    contractor: "Contractor",
    seller: "Seller",
    shipper: "Shipper",
    payer: "Payer",
    customer: "Customer",
    buyer: "Buyer",
    consignee: "Consignee",
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
    fromSupplier: "On behalf of the Supplier",
    sellerSignature: "Seller",
    shippedBy: "Shipped by",
    receivedBy: "Received by",
    signature: "Signature",
    stamp: "Seal",
    actStatement:
      "The work has been completed in full; the parties have no claims against each other.",
    nonFiscalNotice: "Not a fiscal document",
    quoteNotice:
      "This quotation is not an invoice and is not a basis for payment or accounting",
    offerTotal: "Total",
    validUntil: "Valid until",
    paymentTerms: "Payment terms",
    deliveryTerms: "Delivery terms",
    linesCount: "Line items",
    totalQuantity: "Total quantity",
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
  Exclude<GeneratableDocumentType, DocumentType.WAYBILL>,
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
  sales_receipt: {
    uk: {
      invoiceNo: "Номер товарного чека:",
      invoiceDate: "Дата:",
      generatedAt: "Документ сформовано:",
      thankYou: "Дякуємо за покупку!",
      footerMessage: "Якщо у вас є питання, будь ласка, зв’яжіться з нами.",
    },
    ru: {
      invoiceNo: "Номер товарного чека:",
      invoiceDate: "Дата:",
      generatedAt: "Документ сформирован:",
      thankYou: "Спасибо за покупку!",
      footerMessage: "Если у вас есть вопросы, пожалуйста, свяжитесь с нами.",
    },
    en: {
      invoiceNo: "Receipt No:",
      invoiceDate: "Date:",
      generatedAt: "Document generated:",
      thankYou: "Thank you for your purchase!",
      footerMessage: "If you have any questions, please contact us.",
    },
  },
  packing_list: {
    uk: {
      invoiceNo: "Номер пакувального листа:",
      invoiceDate: "Дата:",
      generatedAt: "Документ сформовано:",
      thankYou: "Дякуємо за співпрацю!",
      footerMessage: "Якщо у вас є питання, будь ласка, зв’яжіться з нами.",
    },
    ru: {
      invoiceNo: "Номер упаковочного листа:",
      invoiceDate: "Дата:",
      generatedAt: "Документ сформирован:",
      thankYou: "Благодарим за сотрудничество!",
      footerMessage: "Если у вас есть вопросы, пожалуйста, свяжитесь с нами.",
    },
    en: {
      invoiceNo: "Packing list No:",
      invoiceDate: "Date:",
      generatedAt: "Document generated:",
      thankYou: "Thank you for your business!",
      footerMessage: "If you have any questions, please contact us.",
    },
  },
  quote: {
    uk: {
      invoiceNo: "Номер пропозиції:",
      invoiceDate: "Дата пропозиції:",
      generatedAt: "Пропозицію сформовано:",
      thankYou: "Дякуємо за інтерес до нашої пропозиції!",
      footerMessage: "Якщо у вас є питання, будь ласка, зв’яжіться з нами.",
    },
    ru: {
      invoiceNo: "Номер предложения:",
      invoiceDate: "Дата предложения:",
      generatedAt: "Предложение сформировано:",
      thankYou: "Благодарим за интерес к нашему предложению!",
      footerMessage: "Если у вас есть вопросы, пожалуйста, свяжитесь с нами.",
    },
    en: {
      invoiceNo: "Quotation No:",
      invoiceDate: "Quotation date:",
      generatedAt: "Quotation generated:",
      thankYou: "Thank you for your interest in our offer!",
      footerMessage: "If you have any questions, please contact us.",
    },
  },
};
