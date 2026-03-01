import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Download, FileText, AlertCircle } from "lucide-react";

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
    try {
      const res = await publicApi.get(`/public/receipts/${token}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${data?.receipt.number || "download"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-2xl px-4">
          <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto" />
          <div className="h-4 bg-gray-200 rounded w-1/4 mx-auto" />
          <div className="h-64 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center px-4">
          <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-700 mb-2">
            Receipt Not Found
          </h1>
          <p className="text-gray-500">
            This receipt link is invalid or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  const { receipt, companyInfo } = data;
  const { order } = receipt;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          {companyInfo.companyName && (
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {companyInfo.companyName}
            </h1>
          )}
          {companyInfo.companyAddress && (
            <p className="text-sm text-gray-500">{companyInfo.companyAddress}</p>
          )}
        </div>

        {/* Receipt card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Receipt header */}
          <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {companyInfo.receiptTitle || "Receipt"}
                </h2>
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloading ? "..." : "Download PDF"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
              <span>#{receipt.number}</span>
              <span>{formatDate(receipt.created_at)}</span>
            </div>
          </div>

          {/* Items */}
          <div className="px-6 py-4">
            <table className="w-full">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2">Item</th>
                  <th className="text-center pb-2 w-16">Qty</th>
                  <th className="text-right pb-2 w-28">Price</th>
                  <th className="text-right pb-2 w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 text-sm text-gray-900">
                      {item.product_name}
                    </td>
                    <td className="py-3 text-sm text-gray-500 text-center">
                      {item.qty}
                    </td>
                    <td className="py-3 text-sm text-gray-500 text-right tabular-nums">
                      {formatCurrency(item.unit_price_cents, order.currency)}
                    </td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right tabular-nums">
                      {formatCurrency(item.line_total_cents, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Subtotal</span>
              <span className="text-sm tabular-nums text-gray-700">
                {formatCurrency(order.subtotal_cents, order.currency)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-base font-semibold text-gray-900">
                Total
              </span>
              <span className="text-xl font-bold tabular-nums text-gray-900">
                {formatCurrency(order.total_cents, order.currency)}
              </span>
            </div>
          </div>

          {/* Recipient */}
          {order.recipient && (
            <div className="px-6 py-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Bill To
              </h3>
              <div className="space-y-0.5 text-sm text-gray-700">
                {order.recipient.name && <p className="font-medium">{order.recipient.name}</p>}
                {order.recipient.email && <p>{order.recipient.email}</p>}
                {order.recipient.phone && <p>{order.recipient.phone}</p>}
                {order.recipient.address && <p>{order.recipient.address}</p>}
              </div>
            </div>
          )}

          {/* Company contact */}
          {(companyInfo.companyEmail || companyInfo.companyPhone || companyInfo.companyWebsite) && (
            <div className="px-6 py-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Contact
              </h3>
              <div className="space-y-0.5 text-sm text-gray-500">
                {companyInfo.companyEmail && <p>{companyInfo.companyEmail}</p>}
                {companyInfo.companyPhone && <p>{companyInfo.companyPhone}</p>}
                {companyInfo.companyWebsite && <p>{companyInfo.companyWebsite}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          {companyInfo.companyTagline && (
            <p className="text-sm text-gray-400 italic">
              {companyInfo.companyTagline}
            </p>
          )}
          <p className="text-xs text-gray-300 mt-2">
            Powered by ReceiptMaster
          </p>
        </div>
      </div>
    </div>
  );
};
