import { isProtectedPath, markSessionExpired } from "./session-expiry";
import i18n from "./i18n";
import axios, { type InternalAxiosRequestConfig } from "axios";
import {
  ACCESS_TOKEN_KEY,
  type StoredSession,
  clearStoredSession,
  readStoredSession,
  resolveRefreshFailure,
  storeSession,
} from "./auth-session";
import type { components } from "./api-types.generated";

export type {
  Product,
  Recipient,
  Supplier,
  OrderItem,
  Order,
  Receipt,
  DailyRevenue,
  OrderStatusSummary,
  RevenueByProduct,
  RevenueByRecipient,
  TotalRevenue,
  TurnoverByProduct,
  TurnoverByRecipient,
  TotalTurnover,
  PaginatedResponse,
  PaginationParams,
  InventoryValue,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
} from "./api-types";

import type {
  Product,
  Recipient,
  Supplier,
  Order,
  Receipt,
  DailyRevenue,
  OrderStatusSummary,
  RevenueByProduct,
  RevenueByRecipient,
  TotalRevenue,
  TurnoverByProduct,
  TurnoverByRecipient,
  TotalTurnover,
  PaginatedResponse,
  PaginationParams,
  InventoryValue,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
} from "./api-types";

type UpdateProductFields = Omit<
  components["schemas"]["UpdateProductDto"],
  "quantity" | "expectedQuantity"
>;

/**
 * A partial product update. Stock is never sent alone: `quantity` travels with
 * the `expectedQuantity` it replaces (409 when the stored stock moved).
 */
export type UpdateProductRequest = UpdateProductFields &
  (
    | { quantity?: never; expectedQuantity?: never }
    | { quantity: number; expectedQuantity: number }
  );

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";
const API_KEY = import.meta.env.VITE_API_KEY || "your-secret-key-here";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor: one refresh per tab at a time, coordinated with other
// tabs only through the shared token storage (see auth-session.ts).
type RetriableRequest = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _sessionRetry?: boolean;
};

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

// The only place that ends a session on the client.
const clearAuthAndRedirect = () => {
  document.cookie = "auth_token=; Max-Age=0; path=/; SameSite=Lax";
  clearStoredSession();
  delete api.defaults.headers.common["Authorization"];
  markSessionExpired();
  // On a private page, reload in place: the login screen appears there and
  // signing in returns the user to the same URL.
  if (isProtectedPath(window.location.pathname)) {
    window.location.reload();
    return;
  }
  window.location.href = "/";
};

const bearerOf = (request: RetriableRequest): string | null => {
  const header = request.headers?.Authorization;
  return typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
};

const retryWith = (request: RetriableRequest, accessToken: string) => {
  api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
  request.headers.Authorization = `Bearer ${accessToken}`;
  return api(request);
};

const refreshAndRetry = async (
  originalRequest: RetriableRequest,
  sent: StoredSession & { refreshToken: string },
) => {
  originalRequest._retry = true;
  isRefreshing = true;
  try {
    const response = await api.post<AuthResponse>("/auth/refresh", {
      refresh_token: sent.refreshToken,
    });
    const { access_token, refresh_token } = response.data;
    storeSession({ accessToken: access_token, refreshToken: refresh_token });
    processQueue(null, access_token);
    return retryWith(originalRequest, access_token);
  } catch (refreshError) {
    const status = axios.isAxiosError(refreshError)
      ? refreshError.response?.status
      : undefined;
    const outcome = await resolveRefreshFailure(sent, status);
    if (outcome.kind === "adopt") {
      // Another tab won the rotation; its session is ours too.
      processQueue(null, outcome.accessToken);
      return retryWith(originalRequest, outcome.accessToken);
    }
    processQueue(refreshError, null);
    if (outcome.kind === "signed-out") clearAuthAndRedirect();
    return Promise.reject(refreshError);
  } finally {
    isRefreshing = false;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriableRequest | undefined;
    const status = error.response?.status;
    const url = originalRequest?.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    if (
      status !== 401 ||
      !originalRequest ||
      isAuthEndpoint ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    const stored = readStoredSession();
    // Another tab (or an earlier refresh here) already stored a newer access
    // token than the one this request carried: retry once with it, no refresh.
    if (
      !originalRequest._sessionRetry &&
      stored.accessToken &&
      stored.accessToken !== bearerOf(originalRequest)
    ) {
      originalRequest._sessionRetry = true;
      return retryWith(originalRequest, stored.accessToken);
    }

    const { refreshToken } = stored;
    if (!refreshToken) {
      clearAuthAndRedirect();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    return refreshAndRetry(originalRequest, { ...stored, refreshToken });
  },
);

type CreateOptions = { readonly idempotencyKey?: string };

const idempotencyConfig = ({ idempotencyKey }: CreateOptions) =>
  idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {};

/** Changed fields only; `null` clears email, phone or address (UpdateRecipientDto). */
export type UpdateRecipientRequest = components["schemas"]["UpdateRecipientDto"];

// API methods
export const authApi = {
  login: (data: LoginRequest) => api.post<AuthResponse>("/auth/login", data),

  register: (data: RegisterRequest) =>
    api.post<AuthResponse>("/auth/register", data),

  refresh: (refresh_token: string) =>
    api.post<AuthResponse>("/auth/refresh", { refresh_token }),

  logout: (refresh_token: string) =>
    api.post<{ message: string }>("/auth/logout", { refresh_token }),

  getProfile: () => api.get<User>("/auth/profile"),

  updateProfile: (data: { email: string }) =>
    api.patch<User>("/auth/profile", data),

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => api.post<{ message: string }>("/auth/change-password", data),
};

export const productsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Product>>("/products", { params }),

  getById: (id: string) => api.get<Product>(`/products/${id}`),

  /** With an idempotencyKey, a retried create replays the first one (24 h). */
  create: (
    data: Omit<Product, "id" | "created_at" | "updated_at">,
    options: CreateOptions = {},
  ) => api.post<Product>("/products", data, idempotencyConfig(options)),

  /** Send only changed fields; a quantity needs the expectedQuantity it replaces. */
  update: (id: string, data: UpdateProductRequest) =>
    api.patch<Product>(`/products/${id}`, data),

  delete: (id: string) => api.delete(`/products/${id}`),

  getLowStock: (threshold?: number) =>
    api.get<Product[]>(`/products/low-stock`, { params: { threshold } }),

  getStockValue: () => api.get<InventoryValue>(`/products/stock-value`),

  bulkDelete: (ids: string[]) =>
    api.delete<{ deleted: number; skipped: string[] }>("/products/bulk", {
      data: { ids },
    }),
};

export const recipientsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Recipient>>("/recipients", { params }),

  getById: (id: string) => api.get<Recipient>(`/recipients/${id}`),

  /** With an idempotencyKey, a retried create replays the first one (24 h). */
  create: (
    data: Omit<Recipient, "id" | "created_at" | "updated_at">,
    options: CreateOptions = {},
  ) => api.post<Recipient>("/recipients", data, idempotencyConfig(options)),

  update: (id: string, data: UpdateRecipientRequest) =>
    api.patch<Recipient>(`/recipients/${id}`, data),

  delete: (id: string) => api.delete(`/recipients/${id}`),
};

export const suppliersApi = {
  getAll: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Supplier>>("/suppliers", { params }),

  getById: (id: string) => api.get<Supplier>(`/suppliers/${id}`),

  create: (
    data: Omit<
      Supplier,
      "id" | "created_at" | "updated_at" | "products" | "product_count"
    >,
  ) => api.post<Supplier>("/suppliers", data),

  update: (
    id: string,
    data: Partial<
      Omit<
        Supplier,
        "id" | "created_at" | "updated_at" | "products" | "product_count"
      >
    >,
  ) => api.patch<Supplier>(`/suppliers/${id}`, data),

  delete: (id: string) => api.delete(`/suppliers/${id}`),
};

export const ordersApi = {
  getAll: (
    params?: PaginationParams & {
      status?: string;
      startDate?: string;
      endDate?: string;
      minAmount?: number;
      maxAmount?: number;
      productId?: string;
    },
  ) => api.get<PaginatedResponse<Order>>("/orders", { params }),

  /** Ids of every order the list would show for these filters (at most one batch of 500). */
  getMatchingIds: (params: {
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
  }) => api.get<{ ids: string[]; total: number }>("/orders/ids", { params }),

  getById: (id: string) => api.get<Order>(`/orders/${id}`),

  create: (data: {
    recipientId: string;
    items: { productId: string; qty: number; unitPriceCents?: number }[];
  }) => api.post<Order>("/orders", data),

  update: (
    id: string,
    data: {
      recipientId?: string;
      items?: { productId: string; qty: number; unitPriceCents?: number }[];
    },
  ) => api.patch<Order>(`/orders/${id}`, data),

  confirm: (id: string) => api.patch<Order>(`/orders/${id}/confirm`),

  cancel: (id: string) => api.patch<Order>(`/orders/${id}/cancel`),

  delete: (id: string) => api.delete(`/orders/${id}`),

  batchApprove: (orderIds: string[]) =>
    api.post<{ approved: number }>("/orders/batch-approve", { orderIds }),

  batchDelete: (orderIds: string[]) =>
    api.post<{ deleted: number }>("/orders/batch-delete", { orderIds }),
};

export const dashboardApi = {
  getDailyRevenue: (days?: number) =>
    api.get<DailyRevenue[]>("/orders/dashboard/daily-revenue", {
      params: { days },
    }),

  getOrderStatusSummary: () =>
    api.get<OrderStatusSummary>("/orders/dashboard/status-summary"),

  getRevenueByProducts: (params?: { startDate?: string; endDate?: string }) =>
    api.get<RevenueByProduct[]>("/orders/dashboard/revenue-by-products", {
      params,
    }),

  getRevenueByRecipients: (params?: { startDate?: string; endDate?: string }) =>
    api.get<RevenueByRecipient[]>("/orders/dashboard/revenue-by-recipients", {
      params,
    }),

  getTotalRevenue: (params?: { startDate?: string; endDate?: string }) =>
    api.get<TotalRevenue>("/orders/dashboard/total-revenue", { params }),

  getTurnoverByProducts: (params?: { startDate?: string; endDate?: string }) =>
    api.get<TurnoverByProduct[]>("/orders/dashboard/turnover-by-products", {
      params,
    }),

  getTurnoverByRecipients: (params?: {
    startDate?: string;
    endDate?: string;
  }) =>
    api.get<TurnoverByRecipient[]>("/orders/dashboard/turnover-by-recipients", {
      params,
    }),

  getTotalTurnover: (params?: { startDate?: string; endDate?: string }) =>
    api.get<TotalTurnover>("/orders/dashboard/total-turnover", { params }),
};

export const receiptsApi = {
  getAll: (params?: { offset?: number; limit?: number }) =>
    api.get<{ data: Receipt[]; total: number; offset: number; limit: number }>(
      "/receipts",
      { params },
    ),

  create: (orderId: string) =>
    api.post<Receipt>(`/receipts/orders/${orderId}/receipt`),

  /** Retention cap and the receipt the next one would replace (null while under the cap). */
  getRetention: () =>
    api.get<{
      limit: number;
      count: number;
      replaces: { id: string; number: string; order_id: string } | null;
    }>("/receipts/retention"),

  getById: (id: string) => api.get<Receipt>(`/receipts/${id}`),

  getPdf: (id: string) =>
    api.get(`/receipts/${id}/pdf`, { responseType: "blob" }),

  getPrinters: () => api.get<{ printers: string[] }>("/receipts/printers"),

  print: (id: string, printer?: string) =>
    api.post<{ success: boolean; message: string }>(
      `/receipts/${id}/print${printer ? `?printer=${encodeURIComponent(printer)}` : ""}`,
    ),

  regenerate: (id: string) => api.post<Receipt>(`/receipts/${id}/regenerate`),

  void: (id: string, reason: string) =>
    api.post<Receipt>(`/receipts/${id}/void`, { reason }),

  testPreview: () =>
    api.post("/receipts/test-preview", {}, { responseType: "blob" }),

  share: (id: string) =>
    api.post<{ token: string; url: string }>(`/receipts/${id}/share`),

  revokeShare: (id: string) => api.post(`/receipts/${id}/share/revoke`),

  getTemplatePreviewHtml: (templateId: string, language: string) => {
    const params = new URLSearchParams({ template: templateId, language });
    return api.get<string>(`/pdf-test/preview-template?${params}`, {
      responseType: "text",
      transformResponse: [(data: string) => data],
    });
  },
};

export type CompanyInfo = {
  companyName: string; companyAddress: string; companyEmail: string; companyPhone: string;
  companyTaxId: string; companyIban: string; companySwift: string; companyWebsite: string; companyTagline: string;
};
export type ReceiptDesignSettings = {
  receiptTitle: string; hasCustomReceiptTitle?: boolean; templateId: string; templateLanguage: string;
  footerTitle: string; footerSubtitle: string; primaryColor: string; paymentTerms: string; deliveryTerms: string;
};

export const settingsApi = {
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append("logo", file);
    return api.post("/settings/logo/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  getLogo: () => api.get("/settings/logo", { responseType: "blob" }),

  deleteLogo: () => api.post("/settings/logo/delete"),

  getReceiptDesign: () => api.get<{ data: ReceiptDesignSettings }>("/settings/receipt-design"),

  getAutoReceipt: () =>
    api.get<{ data: { enabled: boolean } }>("/settings/auto-receipt"),

  updateAutoReceipt: (enabled: boolean) =>
    api.post<{ data: { enabled: boolean } }>("/settings/auto-receipt", {
      enabled,
    }),

  getTemplateSettings: () =>
    api.get<{ templateId: string }>("/settings/template"),

  updateTemplateSettings: (templateId: string) =>
    api.post("/settings/template", { templateId }),

  getAvailableTemplates: () =>
    api.get<{
      data: Array<{
        id: string;
        name: string;
        description: string;
        category: string;
        features: string[];
        colors: {
          primary: string;
          secondary: string;
          accent: string;
        };
      }>;
    }>("/settings/templates"),

  getTemplateLanguage: () =>
    api.get<{ data: { language: string } }>("/settings/template-language"),

  updateTemplateLanguage: (language: string) =>
    api.post("/settings/template-language", { language }),

  getFooterTitle: () =>
    api.get<{ footerTitle: string }>("/settings/footer-title"),

  updateFooterTitle: (footerTitle: string) =>
    api.post("/settings/footer-title", { footerTitle }),

  getFooterSubtitle: () =>
    api.get<{ footerSubtitle: string }>("/settings/footer-subtitle"),

  updateFooterSubtitle: (footerSubtitle: string) =>
    api.post("/settings/footer-subtitle", { footerSubtitle }),

  getReceiptTitle: () => api.get<{ title: string }>("/settings/receipt-title"),

  updateReceiptTitle: (title: string) =>
    api.post("/settings/receipt-title", { title }),

  getCompanyInfo: () => api.get<{ data: CompanyInfo }>("/settings/company-info"),

  updateFooter: (footer: { footerTitle: string; footerSubtitle: string }) => api.post("/settings/footer", footer),

  getPrimaryColor: () =>
    api.get<{ primaryColor: string }>("/settings/primary-color"),

  updatePrimaryColor: (primaryColor: string) =>
    api.post("/settings/primary-color", { primaryColor }),

  getPaymentTerms: () =>
    api.get<{ paymentTerms: string }>("/settings/payment-terms"),

  updatePaymentTerms: (paymentTerms: string) =>
    api.post("/settings/payment-terms", { paymentTerms }),

  getDeliveryTerms: () =>
    api.get<{ deliveryTerms: string }>("/settings/delivery-terms"),

  updateDeliveryTerms: (deliveryTerms: string) =>
    api.post("/settings/delivery-terms", { deliveryTerms }),

  getOnboardingStatus: () =>
    api.get<{ completed: boolean }>("/settings/onboarding-status"),

  completeOnboarding: () => api.post("/settings/onboarding-complete"),

  updateCompanyInfo: (companyInfo: {
    companyName?: string;
    companyAddress?: string;
    companyEmail?: string;
    companyPhone?: string;
    companyTaxId?: string;
    companyIban?: string;
    companySwift?: string;
    companyWebsite?: string;
    companyTagline?: string;
  }) => api.post("/settings/company-info", companyInfo),
};

// Formatting utilities
export const formatCurrency = (cents: number, currency: string = "UAH") => {
  const amount = cents / 100;
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

// Dates follow the interface language (and the viewer's own time zone); they used to be
// hard-wired to ru-RU for everyone.
const DATE_LOCALES: Record<string, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  en: "en-GB",
};
const dateLocale = (): string =>
  DATE_LOCALES[i18n.language?.split("-")[0] ?? "en"] ?? "en-GB";

export const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleString(dateLocale());

export const formatDateOnly = (dateString: string | number | Date) =>
  new Date(dateString).toLocaleDateString(dateLocale());

// Parsing utilities
export const amountToCents = (amount: string | number): number => {
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100);
  }
  if (!amount) return 0;
  const normalized = amount
    .toString()
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = parseFloat(normalized);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
};
