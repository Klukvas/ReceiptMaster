import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const API_KEY = import.meta.env.VITE_API_KEY || 'your-secret-key-here';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('auth_token');
      delete api.defaults.headers.common['Authorization'];
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Data types
export interface Product {
  id: string;
  name: string;
  purchase_price_cents: number;
  sale_price_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Recipient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  qty: number;
  line_total_cents: number;
}

export interface Order {
  id: string;
  recipient_id: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  subtotal_cents: number;
  total_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
  recipient: Recipient;
  items: OrderItem[];
  receipts: Receipt[];
}

export interface Receipt {
  id: string;
  order_id: string;
  number: string;
  pdf_url?: string;
  pdf_path?: string;
  hash?: string;
  status: 'generated' | 'void';
  created_at: string;
  order: Order;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// API methods
export const authApi = {
  login: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login', data),
  
  getProfile: () =>
    api.get<User>('/auth/profile'),
};

export const productsApi = {
  getAll: (params?: { limit?: number; offset?: number }) =>
    api.get<{ data: Product[]; total: number }>('/products', { params }),
  
  getById: (id: string) =>
    api.get<Product>(`/products/${id}`),
  
  create: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Product>('/products', data),
  
  update: (id: string, data: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at'>>) =>
    api.patch<Product>(`/products/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/products/${id}`),
};

export const recipientsApi = {
  getAll: (params?: { limit?: number; offset?: number }) =>
    api.get<{ data: Recipient[]; total: number }>('/recipients', { params }),
  
  getById: (id: string) =>
    api.get<Recipient>(`/recipients/${id}`),
  
  create: (data: Omit<Recipient, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Recipient>('/recipients', data),
  
  update: (id: string, data: Partial<Omit<Recipient, 'id' | 'created_at' | 'updated_at'>>) =>
    api.patch<Recipient>(`/recipients/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/recipients/${id}`),
};

export const ordersApi = {
  getAll: (params?: { limit?: number; offset?: number; status?: string }) =>
    api.get<{ data: Order[]; total: number; offset: number; limit: number }>('/orders', { params }),
  
  getById: (id: string) =>
    api.get<Order>(`/orders/${id}`),
  
  create: (data: { recipientId: string; items: { productId: string; qty: number }[] }) =>
    api.post<Order>('/orders', data),
  
  update: (id: string, data: { recipientId?: string; items?: { productId: string; qty: number }[] }) =>
    api.patch<Order>(`/orders/${id}`, data),
  
  confirm: (id: string) =>
    api.patch<Order>(`/orders/${id}/confirm`),
  
  cancel: (id: string) =>
    api.patch<Order>(`/orders/${id}/cancel`),
  
  delete: (id: string) =>
    api.delete(`/orders/${id}`),
};

export const receiptsApi = {
  getAll: () =>
    api.get<Receipt[]>('/receipts'),
  
  create: (orderId: string) =>
    api.post<Receipt>(`/receipts/orders/${orderId}/receipt`),
  
  getById: (id: string) =>
    api.get<Receipt>(`/receipts/${id}`),
  
  getPdf: (id: string) =>
    api.get(`/receipts/${id}/pdf`, { responseType: 'blob' }),
  
  getPrinters: () =>
    api.get<{ printers: string[] }>('/receipts/printers'),
  
  print: (id: string, printer?: string) =>
    api.post<{ success: boolean; message: string }>(`/receipts/${id}/print${printer ? `?printer=${encodeURIComponent(printer)}` : ''}`),
};

export const settingsApi = {
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.post('/settings/logo/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  getLogo: () =>
    api.get('/settings/logo', { responseType: 'blob' }),

  deleteLogo: () =>
    api.post('/settings/logo/delete'),

  updateCompanyName: (companyName: string) =>
    api.post('/settings/company-name', { companyName }),

  getCompanyName: () =>
    api.get<{ companyName: string }>('/settings/company-name'),
};

// Formatting utilities
export const formatCurrency = (cents: number, currency: string = 'UAH') => {
  const amount = cents / 100;
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('ru-RU');
};

// Parsing utilities
// Converts a user-entered currency amount (e.g., "99.99" or "99,99") to integer cents
export const amountToCents = (amount: string | number): number => {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100);
  }
  if (!amount) return 0;
  const normalized = amount
    .toString()
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  const parsed = parseFloat(normalized);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
};
