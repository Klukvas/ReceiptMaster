import { api } from "./api";

export interface SubscriptionLimits {
  maxProducts: number | null;
  maxOrdersPerMonth: number | null;
  allowedTemplateIds: string[] | null;
}

export interface SubscriptionUsage {
  productsCount: number;
  ordersThisMonth: number;
}

export interface SubscriptionStatus {
  plan: "free" | "pro" | "business";
  usage: SubscriptionUsage;
  limits: SubscriptionLimits;
  paddleStatus: string | null;
  currentPeriodEnd: string | null;
  hasPaddleSubscription: boolean;
}

export const subscriptionApi = {
  getStatus: async (): Promise<SubscriptionStatus> => {
    const response = await api.get<SubscriptionStatus>("/subscription/status");
    return response.data;
  },

  checkout: async (
    plan: "pro" | "business",
  ): Promise<{ transactionId: string }> => {
    const response = await api.post<{ transactionId: string }>(
      "/subscription/checkout",
      { plan },
    );
    return response.data;
  },

  portal: async (): Promise<{ url: string }> => {
    const response = await api.post<{ url: string }>("/subscription/portal");
    return response.data;
  },
};

export const isProductLimitReached = (status: SubscriptionStatus): boolean => {
  if (status.limits.maxProducts === null) return false;
  return status.usage.productsCount >= status.limits.maxProducts;
};

export const isOrderLimitReached = (status: SubscriptionStatus): boolean => {
  if (status.limits.maxOrdersPerMonth === null) return false;
  return status.usage.ordersThisMonth >= status.limits.maxOrdersPerMonth;
};

export const isTemplateAllowed = (
  status: SubscriptionStatus,
  templateId: string,
): boolean => {
  if (status.limits.allowedTemplateIds === null) return true;
  return status.limits.allowedTemplateIds.includes(templateId);
};
