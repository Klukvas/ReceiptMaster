import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Download, FileText, AlertCircle } from "lucide-react";
import { downloadPdf } from "../lib/pdf-utils";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

const publicApi = axios.create({ baseURL: API_BASE_URL });

interface PublicReceiptData {
  receipt: {
    id: string;
    number: string;
    created_at: string;
    order: {
      id: string;
      currency: string;
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

const formatCurrency = (cents: number, currency: string = "UAH") => {
  const amount = cents / 100;
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const PublicReceiptPage = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!token) return;
    publicApi
      .get<PublicReceiptData>(`/public/receipts/${token}`)
      .then((res) => setData(res.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const res = await publicApi.get(`/public/receipts/${token}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      downloadPdf(blob, `receipt-${data?.receipt.number || "download"}.pdf`);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-2xl px-4">
          <div className="h-8 bg-surface-alt rounded w-1/3 mx-auto" />
          <div className="h-4 bg-surface-alt rounded w-1/4 mx-auto" />
          <div className="h-64 bg-surface-alt rounded" />
          <div className="h-32 bg-surface-alt rounded" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="text-center px-4">
          <AlertCircle className="w-16 h-16 text-content-tertiary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-content-secondary mb-2">
            Receipt Not Found
          </h1>
          <p className="text-content-tertiary">
            This receipt link is invalid or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  const { receipt, companyInfo } = data;
  const { order } = receipt;

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
                  {companyInfo.receiptTitle || "Receipt"}
                </h2>
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-accent-base rounded-lg hover:bg-accent-base-hover transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloading ? "..." : "Download PDF"}
              </button>
            </div>
            {downloadError && (
              <p className="mt-2 text-sm text-danger-base">
                Failed to download PDF. Please try again.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-content-tertiary">
              <span>#{receipt.number}</span>
              <span>{formatDate(receipt.created_at)}</span>
            </div>
          </div>

          {/* Items */}
          <div className="px-6 py-4 overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wider text-content-tertiary border-b border-[var(--color-border-light)]">
                  <th className="text-left pb-2">Item</th>
                  <th className="text-center pb-2 w-16">Qty</th>
                  <th className="text-right pb-2 w-28">Price</th>
                  <th className="text-right pb-2 w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-light)]">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 text-sm text-content">
                      {item.product_name}
                    </td>
                    <td className="py-3 text-sm text-content-tertiary text-center">
                      {item.qty}
                    </td>
                    <td className="py-3 text-sm text-content-tertiary text-right tabular-nums">
                      {formatCurrency(item.unit_price_cents, order.currency)}
                    </td>
                    <td className="py-3 text-sm font-medium text-content text-right tabular-nums">
                      {formatCurrency(item.line_total_cents, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-6 py-4 border-t border-[var(--color-border-light)] bg-surface-alt">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-content-tertiary">Subtotal</span>
              <span className="text-sm tabular-nums text-content-secondary">
                {formatCurrency(order.subtotal_cents, order.currency)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-[var(--color-border)]">
              <span className="text-base font-semibold text-content">
                Total
              </span>
              <span className="text-xl font-bold tabular-nums text-content">
                {formatCurrency(order.total_cents, order.currency)}
              </span>
            </div>
          </div>

          {/* Recipient */}
          {order.recipient && (
            <div className="px-6 py-4 border-t border-[var(--color-border-light)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-2">
                Bill To
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
                Contact
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
            Powered by ReceiptMaster
          </p>
        </div>
      </div>
    </div>
  );
};
