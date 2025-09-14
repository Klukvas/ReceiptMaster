export interface CartItem {
  productId: string;
  name: string;
  price: number; // в копейках
  quantity: number;
}

export interface UserCart {
  userId: number;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export enum UserState {
  IDLE = 'idle',
  SELECTING_PRODUCT = 'selecting_product',
  ENTERING_QUANTITY = 'entering_quantity',
  REVIEWING_ORDER = 'reviewing_order',
  CONFIRMING_ORDER = 'confirming_order'
}

export interface UserSession {
  userId: number;
  state: UserState;
  cart: UserCart;
  lastMessageId?: number;
  pendingProductId?: string; // ID товара, для которого вводится количество
}
