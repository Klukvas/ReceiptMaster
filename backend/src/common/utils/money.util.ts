export class MoneyUtil {
  /**
   * Форматирует сумму в копейках в рубли с разделителями
   */
  static formatCentsToRubles(cents: number): string {
    const rubles = cents / 100;
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2,
    }).format(rubles);
  }

  /**
   * Форматирует сумму в копейках в указанную валюту
   */
  static formatCentsToCurrency(cents: number, currency: string): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Вычисляет НДС от суммы
   */
  static calculateVat(amount: number, vatRate: number): number {
    return Math.round(amount * vatRate);
  }

  /**
   * Вычисляет сумму с НДС
   */
  static calculateTotalWithVat(amount: number, vatRate: number): number {
    return amount + this.calculateVat(amount, vatRate);
  }
}
