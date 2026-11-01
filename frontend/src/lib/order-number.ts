/** How an order is quoted to people: "#17". The number is per account and never reused. */
export const formatOrderNumber = (order: { order_number: number }): string =>
  `#${order.order_number}`;
