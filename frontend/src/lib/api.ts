import axios from "axios";

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
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
} from "./api-types";

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
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Add response interceptor to handle auth errors with refresh token retry
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

const clearAuthAndRedirect = () => {
  document.cookie = "auth_token=; Max-Age=0; path=/; SameSite=Lax";
  localStorage.removeItem("auth_token");
  localStorage.removeItem("refresh_token");
  delete api.defaults.headers.common["Authorization"];
  window.location.href = "/";
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = originalRequest?.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    if (status === 401 && !isAuthEndpoint && !originalRequest._retry) {
      const refreshToken = localStorage.getItem("refresh_token");

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

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await api.post<AuthResponse>("/auth/refresh", {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token: newRefreshToken } = response.data;

        localStorage.setItem("auth_token", access_token);
        localStorage.setItem("refresh_token", newRefreshToken);
        api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
        originalRequest.headers.Authorization = `Bearer ${access_token}`;

        processQueue(null, access_token);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthAndRedirect();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

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

  create: (data: Omit<Product, "id" | "created_at" | "updated_at">) =>
    api.post<Product>("/products", data),

  update: (
    id: string,
    data: Partial<Omit<Product, "id" | "created_at" | "updated_at">>,
  ) => api.patch<Product>(`/products/${id}`, data),

  delete: (id: string) => api.delete(`/products/${id}`),

  getLowStock: (threshold?: number) =>
    api.get<Product[]>(`/products/low-stock`, { params: { threshold } }),

  bulkDelete: (ids: string[]) =>
    api.delete<{ deleted: number; skipped: string[] }>("/products/bulk", {
      data: { ids },
    }),
};

export const recipientsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Recipient>>("/recipients", { params }),

  getById: (id: string) => api.get<Recipient>(`/recipients/${id}`),

  create: (data: Omit<Recipient, "id" | "created_at" | "updated_at">) =>
    api.post<Recipient>("/recipients", data),

  update: (
    id: string,
    data: Partial<Omit<Recipient, "id" | "created_at" | "updated_at">>,
  ) => api.patch<Recipient>(`/recipients/${id}`, data),

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
    > & {
      productIds?: string[];
    },
  ) => api.post<Supplier>("/suppliers", data),

  update: (
    id: string,
    data: Partial<
      Omit<
        Supplier,
        "id" | "created_at" | "updated_at" | "products" | "product_count"
      > & {
        productIds?: string[];
      }
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

  getReceiptDesign: () =>
    api.get<{
      receiptTitle: string;
      templateId: string;
      templateLanguage: string;
      footerTitle: string;
      footerSubtitle: string;
      primaryColor: string;
      paymentTerms: string;
      deliveryTerms: string;
    }>("/settings/receipt-design"),

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

  getCompanyInfo: () =>
    api.get<{
      companyName: string;
      companyAddress: string;
      companyEmail: string;
      companyPhone: string;
      companyTaxId: string;
      companyIban: string;
      companySwift: string;
      companyWebsite: string;
      companyTagline: string;
    }>("/settings/company-info"),

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

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString("ru-RU");
};

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
