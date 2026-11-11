import {
  documentMoney,
  documentDate,
  type DocumentConfig,
} from "../lib/document-config";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Download, FileText, AlertCircle, Loader2 } from "lucide-react";
import { downloadPdf } from "../lib/pdf-utils";
import {
  documentPdfFilename,
  filenameFromDisposition,
} from "../lib/document-filename";
import { defaultFormattingFor, displayDocumentNumber } from "../lib/public-receipt-format";
import i18n from "../lib/i18n";
import { useTranslation } from "../hooks/useTranslation";
import { SEO } from "../components/seo/SEO";
import { useAfterDelay } from "../hooks/useAfterDelay";

const SUPPORTED_LANGUAGES = ["en", "ru", "uk"];

// The receipt reads in the seller's document language, not the visitor's interface language.
const documentLanguageOf = (value: string | undefined): string => {
  const base = value?.split("-")[0] ?? "";
  return SUPPORTED_LANGUAGES.includes(base) ? base : "en";
};

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

const publicApi = axios.create({ baseURL: API_BASE_URL });

interface PublicReceiptData {
  money?: boolean;
  metadataUnavailable?: boolean;
  formatting?: DocumentConfig["formatting"];
  documentLanguage?: string;
  /** The printed title of the document, when the server sends it. */
  title?: string;
  receipt: {
    id: string;
    number: string;
    title?: string;
    document_type?: string;
    created_at: string;
    order: {
      id: string;
      currency: string;
      created_at?: string;
      subtotal_cents: number;
      total_cents: number;
      items: Array<{
        id: string;
        product_name: string;
        qty: number;
        unit_price_cents: number;
        line_total_cents: number;
      }>;
      recipient?: {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
      };
    };
  };
  companyInfo: {
    companyName?: string;
    companyAddress?: string;
    companyEmail?: string;
    companyPhone?: string;
    companyWebsite?: string;
    companyTagline?: string;
    receiptTitle?: string;
  };
}

const SKELETON_DELAY_MS = 200;
const NOT_FOUND_STATUSES = [404, 410];

type LoadFailure = "notFound" | "unavailable";

// Only a missing/revoked link is "not found"; network errors and 5xx are worth retrying.
const classifyLoadFailure = (error: unknown): LoadFailure =>
  axios.isAxiosError(error) &&
  error.response &&
  NOT_FOUND_STATUSES.includes(error.response.status)
    ? "notFound"
    : "unavailable";

const SKELETON_TONE = "bg-[var(--color-border)] animate-pulse motion-reduce:animate-none";

// Same outer layout as the loaded page so nothing jumps when the data arrives.
const ReceiptSkeleton = ({ isVisible }: { isVisible: boolean }) => (
  <div className="min-h-screen bg-surface-alt" aria-busy="true">
    {isVisible && (
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12" aria-hidden="true">
        <div className="mb-8 flex justify-center">
          <div className={`h-8 w-1/3 rounded ${SKELETON_TONE}`} />
        </div>
        <div className="bg-elevated rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--color-border-light)]">
            <div className={`h-7 w-1/2 rounded ${SKELETON_TONE}`} />
            <div className={`mt-4 h-4 w-1/3 rounded ${SKELETON_TONE}`} />
          </div>
          <div className="px-4 py-4 sm:px-6">
            <div className={`mb-2 h-4 rounded ${SKELETON_TONE}`} />
            {[0, 1, 2].map((row) => (
              <div key={row} className="py-1.5">
                <div className={`h-[3.25rem] sm:h-9 rounded ${SKELETON_TONE}`} />
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-[var(--color-border-light)] space-y-3">
            <div className={`h-5 rounded ${SKELETON_TONE}`} />
            <div className={`h-8 rounded ${SKELETON_TONE}`} />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <div className={`h-4 w-1/4 rounded ${SKELETON_TONE}`} />
        </div>
      </div>
    )}
  </div>
);

interface DownloadButtonProps {
  label: string;
  isBusy: boolean;
  onClick: () => void;
}

const DownloadButton = ({ label, isBusy, onClick }: DownloadButtonProps) => (
  <button
    onClick={onClick}
    disabled={isBusy}
    aria-busy={isBusy}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-accent-base rounded-lg hover:bg-accent-base-hover transition-colors disabled:opacity-50 pointer-coarse:min-h-11"
  >
    {isBusy ? (
      <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
    ) : (
      <Download className="w-4 h-4" />
    )}
    {label}
  </button>
);

const PublicReceiptContent = () => {
  const { token } = useParams<{ token: string }>();
  const { t: interfaceT } = useTranslation();
  const [data, setData] = useState<PublicReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const showSkeleton = useAfterDelay(SKELETON_DELAY_MS);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let isCurrent = true;
    publicApi
      .get<PublicReceiptData>(`/public/receipts/${token}`)
      .then((res) => {
        if (isCurrent) setData(res.data);
      })
      .catch((error: unknown) => {
        if (isCurrent) setFailure(classifyLoadFailure(error));
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [token, attempt]);

  const retryLoad = () => {
    setFailure(null);
    setLoading(true);
    setAttempt((count) => count + 1);
  };

  const language = documentLanguageOf(data?.documentLanguage);
  useEffect(() => {
    if (!data) return;
    document.documentElement.lang = language;
    return () => {
      document.documentElement.lang = i18n.language.split("-")[0];
    };
  }, [data, language]);

  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const res = await publicApi.get(`/public/receipts/${token}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const filename =
        filenameFromDisposition(res.headers["content-disposition"]) ??
        documentPdfFilename(
          data?.receipt.document_type,
          data?.receipt.number || "download",
        );
      downloadPdf(blob, filename);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <ReceiptSkeleton isVisible={showSkeleton} />;

  if (failure || !data) {
    const isNotFound = failure !== "unavailable";
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="text-center px-4">
          <AlertCircle className="w-16 h-16 text-content-tertiary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-content-secondary mb-2">
            {isNotFound
              ? interfaceT("publicReceipt.notFoundTitle")
              : interfaceT("publicReceipt.loadFailed")}
          </h1>
          {isNotFound ? (
            <p className="text-content-tertiary">
              {interfaceT("publicReceipt.notFoundBody")}
            </p>
          ) : (
            <button
              onClick={retryLoad}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-accent-base rounded-lg hover:bg-accent-base-hover transition-colors pointer-coarse:min-h-11"
            >
              {interfaceT("publicReceipt.retry")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const t = i18n.getFixedT(language);
  const { receipt, companyInfo } = data;
  const { order } = receipt;
  const formatting = data.formatting ?? defaultFormattingFor(language);
  const formatCurrency = (cents: number, currency: string) =>
    documentMoney(cents, currency, formatting);
  const formatDate = (date: string) => documentDate(date, language, formatting);
  const typeTitle =
    receipt.document_type && i18n.exists(`documentTypes.${receipt.document_type}`, { lng: language })
      ? t(`documentTypes.${receipt.document_type}`)
      : undefined;
  // The account's custom title belongs to the waybill; another type is named by its own title.
  const isWaybill = !receipt.document_type || receipt.document_type === "waybill";
  const documentTitle =
    data.title ||
    receipt.title ||
    (isWaybill ? companyInfo.receiptTitle : undefined) ||
    typeTitle ||
    t("publicReceipt.defaultTitle");
  const documentNumber = displayDocumentNumber(receipt.number);
  if (!order)
    return (
      <div className="mx-auto max-w-2xl p-8 text-content">
        <h1 className="text-xl font-semibold tabular-nums mb-2">
          {documentNumber}
        </h1>
        <p className="text-sm text-content-tertiary mb-4">
          {t("publicReceipt.legacyUnavailable")}
        </p>
        <DownloadButton
          label={t("publicReceipt.downloadPdf")}
          isBusy={downloading}
          onClick={handleDownload}
        />
        {downloadError && (
          <p role="alert" className="mt-2 text-sm text-danger-base">
            {t("publicReceipt.downloadFailed")}
          </p>
        )}
      </div>
    );

  return (
    <div className="min-h-screen bg-surface-alt">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          {companyInfo.companyName && (
            <h1 className="text-2xl font-bold text-content mb-1">
              {companyInfo.companyName}
            </h1>
          )}
          {companyInfo.companyAddress && (
            <p className="text-sm text-content-tertiary">
              {companyInfo.companyAddress}
            </p>
          )}
        </div>

        {/* Receipt card */}
        <div className="bg-elevated rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
          {/* Receipt header */}
          <div className="px-6 py-5 border-b border-[var(--color-border-light)] bg-surface-alt">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-content-tertiary" />
                <h2 className="text-lg font-semibold text-content">
                  {documentTitle}
                </h2>
              </div>
              <DownloadButton
                label={t("publicReceipt.downloadPdf")}
                isBusy={downloading}
                onClick={handleDownload}
              />
            </div>
            {downloadError && (
              <p role="alert" className="mt-2 text-sm text-danger-base">
                {t("publicReceipt.downloadFailed")}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-content-tertiary">
              <span className="tabular-nums">{documentNumber}</span>
              <span className="tabular-nums">
                {/* The document's own date: a quote or return note is issued after its order. */}
                {formatDate(receipt.created_at ?? order.created_at)}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="px-4 py-4 sm:px-6">
            {/* Fixed layout: a long item name wraps instead of pushing Total out of the card. */}
            <table className="w-full table-fixed">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wider text-content-tertiary border-b border-[var(--color-border-light)]">
                  <th className="text-left pb-2">{t("publicReceipt.item")}</th>
                  <th className="hidden sm:table-cell text-center pb-2 w-16">
                    {t("publicReceipt.qty")}
                  </th>
                  {data.money !== false && (
                    <th className="hidden sm:table-cell text-right pb-2 w-28">
                      {t("publicReceipt.price")}
                    </th>
                  )}
                  {data.money !== false && (
                    <th className="text-right pb-2 w-28">
                      {t("publicReceipt.total")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-light)]">
                {order.items.map((item, index) => (
                  <tr key={`${index}-${item.product_name}`}>
                    <td className="py-3 pr-2 text-sm text-content [overflow-wrap:anywhere]">
                      {item.product_name}
                      {/* Qty and Price columns are hidden on phones; fold them under the name. */}
                      <span className="block sm:hidden text-xs text-content-tertiary tabular-nums">
                        {data.money !== false
                          ? `${item.qty} × ${formatCurrency(item.unit_price_cents, order.currency)}`
                          : `× ${item.qty}`}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell py-3 text-sm text-content-tertiary text-center tabular-nums">
                      {item.qty}
                    </td>
                    {data.money !== false && (
                      <td className="hidden sm:table-cell py-3 text-sm text-content-tertiary text-right tabular-nums">
                        {formatCurrency(item.unit_price_cents, order.currency)}
                      </td>
                    )}
                    {data.money !== false && (
                      <td className="py-3 text-sm font-medium text-content text-right tabular-nums whitespace-nowrap">
                        {formatCurrency(item.line_total_cents, order.currency)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          {data.money !== false && (
            <div className="px-6 py-4 border-t border-[var(--color-border-light)] bg-surface-alt">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-content-tertiary">
                  {t("publicReceipt.subtotal")}
                </span>
                <span className="text-sm tabular-nums text-content-secondary">
                  {formatCurrency(order.subtotal_cents, order.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[var(--color-border)]">
                <span className="text-base font-semibold text-content">
                  {t("publicReceipt.total")}
                </span>
                <span className="text-xl font-bold tabular-nums text-content">
                  {formatCurrency(order.total_cents, order.currency)}
                </span>
              </div>
            </div>
          )}
          {/* Recipient */}
          {order.recipient && (
            <div className="px-6 py-4 border-t border-[var(--color-border-light)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-2">
                {t("publicReceipt.billTo")}
              </h3>
              <div className="space-y-0.5 text-sm text-content-secondary">
                {order.recipient.name && (
                  <p className="font-medium">{order.recipient.name}</p>
                )}
                {order.recipient.email && <p>{order.recipient.email}</p>}
                {order.recipient.phone && <p>{order.recipient.phone}</p>}
                {order.recipient.address && <p>{order.recipient.address}</p>}
              </div>
            </div>
          )}

          {/* Company contact */}
          {(companyInfo.companyEmail ||
            companyInfo.companyPhone ||
            companyInfo.companyWebsite) && (
            <div className="px-6 py-4 border-t border-[var(--color-border-light)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-2">
                {t("publicReceipt.contact")}
              </h3>
              <div className="space-y-0.5 text-sm text-content-tertiary">
                {companyInfo.companyEmail && <p>{companyInfo.companyEmail}</p>}
                {companyInfo.companyPhone && <p>{companyInfo.companyPhone}</p>}
                {companyInfo.companyWebsite && (
                  <p>{companyInfo.companyWebsite}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          {companyInfo.companyTagline && (
            <p className="text-sm text-content-tertiary italic">
              {companyInfo.companyTagline}
            </p>
          )}
          <p className="text-xs text-content-tertiary mt-2">
            {t("publicReceipt.poweredBy")}
          </p>
        </div>
      </div>
    </div>
  );
};

// The link is a private capability URL: keep it out of search results.
export const PublicReceiptPage = () => (
  <>
    <SEO noindex />
    <main>
      <PublicReceiptContent />
    </main>
  </>
);
