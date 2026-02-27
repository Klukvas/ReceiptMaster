import { MoneyUtil } from './money.util';

describe('MoneyUtil', () => {
  describe('formatCentsToRubles', () => {
    it('should format cents to rubles with currency symbol', () => {
      const result = MoneyUtil.formatCentsToRubles(10050);
      expect(result).toContain('100,50');
    });

    it('should handle zero cents', () => {
      const result = MoneyUtil.formatCentsToRubles(0);
      expect(result).toContain('0,00');
    });

    it('should handle large amounts', () => {
      const result = MoneyUtil.formatCentsToRubles(1000000);
      expect(result).toContain('10');
      expect(result).toContain('000');
    });

    it('should handle negative cents', () => {
      const result = MoneyUtil.formatCentsToRubles(-500);
      expect(result).toContain('5,00');
    });
  });

  describe('formatCentsToCurrency', () => {
    it('should format cents to UAH currency', () => {
      const result = MoneyUtil.formatCentsToCurrency(5000, 'UAH');
      expect(result).toContain('50,00');
    });

    it('should format cents to USD currency', () => {
      const result = MoneyUtil.formatCentsToCurrency(2599, 'USD');
      expect(result).toContain('25,99');
    });

    it('should handle zero value', () => {
      const result = MoneyUtil.formatCentsToCurrency(0, 'EUR');
      expect(result).toContain('0,00');
    });
  });

  describe('calculateVat', () => {
    it('should calculate VAT correctly', () => {
      expect(MoneyUtil.calculateVat(10000, 0.2)).toBe(2000);
    });

    it('should round VAT to nearest integer', () => {
      expect(MoneyUtil.calculateVat(333, 0.2)).toBe(67);
    });

    it('should return 0 for zero amount', () => {
      expect(MoneyUtil.calculateVat(0, 0.2)).toBe(0);
    });

    it('should return 0 for zero rate', () => {
      expect(MoneyUtil.calculateVat(10000, 0)).toBe(0);
    });

    it('should handle fractional rates', () => {
      expect(MoneyUtil.calculateVat(1000, 0.07)).toBe(70);
    });
  });

  describe('calculateTotalWithVat', () => {
    it('should calculate total with VAT', () => {
      expect(MoneyUtil.calculateTotalWithVat(10000, 0.2)).toBe(12000);
    });

    it('should return original amount when VAT rate is 0', () => {
      expect(MoneyUtil.calculateTotalWithVat(5000, 0)).toBe(5000);
    });

    it('should handle rounding correctly', () => {
      const result = MoneyUtil.calculateTotalWithVat(333, 0.2);
      expect(result).toBe(333 + 67); // 400
    });
  });
});
