/**
 * Bridge types: maps OpenAPI-generated schema types to frontend type names.
 * Generated types come from `yarn openapi:generate` (api-types.generated.ts).
 * Manual types below cover generics, auth, and computed fields that
 * the OpenAPI spec cannot represent.
 */
import type { components } from "./api-types.generated";

// ─── Entity types (from OpenAPI spec) ────────────────────────────────
export type Product = components["schemas"]["Product"] & {
  supplier_id?: string | null;
};
export type OrderItem = components["schemas"]["OrderItem"];
export type Order = components["schemas"]["Order"];
export type Receipt = components["schemas"]["Receipt"];

// Recipient & Supplier have server-computed fields not in the entity schema
export type Recipient = components["schemas"]["Recipient"] & {
  total_spent_cents?: number;
  order_count?: number;
};

export type Supplier = components["schemas"]["Supplier"] & {
  product_count?: number;
};

// ─── Dashboard types (from OpenAPI spec) ─────────────────────────────
export type DailyRevenue = components["schemas"]["DailyRevenueDto"];
export type OrderStatusSummary = components["schemas"]["OrderStatusSummaryDto"];
export type RevenueByProduct = components["schemas"]["RevenueByProductDto"];
export type RevenueByRecipient = components["schemas"]["RevenueByRecipientDto"];
export type TotalRevenue = components["schemas"]["TotalRevenueDto"];
export type TurnoverByProduct = components["schemas"]["TurnoverByProductDto"];
export type TurnoverByRecipient =
  components["schemas"]["TurnoverByRecipientDto"];
export type TotalTurnover = components["schemas"]["TotalTurnoverDto"];

// ─── Manual types (not in OpenAPI or use generics) ───────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
  };
}

export interface User {
  id: string;
  email: string;
}
