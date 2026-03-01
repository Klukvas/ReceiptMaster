import { TemplateService, ReceiptTemplate } from "./template.service";
import { MoneyUtil } from "../../../common/utils/money.util";

// Mock fs/promises
jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
  access: jest.fn(),
}));

// Mock handlebars
jest.mock("handlebars", () => ({
  registerHelper: jest.fn(),
  compile: jest
    .fn()
    .mockReturnValue((data: any) => `<html>${JSON.stringify(data)}</html>`),
}));

describe("TemplateService", () => {
  let service: TemplateService;

  beforeEach(() => {
    service = new TemplateService();
  });

  describe("prepareTemplateData", () => {
    const mockOrder = {
      id: "order-1",
      currency: "UAH",
      created_at: new Date("2025-01-15T10:00:00Z"),
      subtotal_cents: 5000,
      total_cents: 5500,
      recipient: {
        name: "John Doe",
        email: "john@test.com",
        phone: "+380991234567",
        address: "Kyiv, Ukraine",
      },
      items: [
        {
          product_name: "Widget",
          qty: 2,
          unit_price_cents: 2500,
          line_total_cents: 5000,
        },
      ],
    } as any;

    const mockCompanyInfo = {
      companyName: "Test Corp",
      companyAddress: "Test Street 1",
      companyEmail: "info@test.com",
      companyPhone: "+380001234567",
      companyTaxId: "1234567890",
      companyIban: "UA123456789",
      companySwift: "TESTUA2X",
      companyWebsite: "https://test.com",
      companyTagline: "Best service",
    };

    it("should prepare template data correctly", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
      );

      expect(result.companyName).toBe("Test Corp");
      expect(result.receiptNumber).toBe("2025-000001");
      expect(result.recipientName).toBe("John Doe");
      expect(result.recipientEmail).toBe("john@test.com");
      expect(result.recipientPhone).toBe("+380991234567");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productName).toBe("Widget");
      expect(result.items[0].qty).toBe(2);
      expect(result.hasCustomLogo).toBe(false);
      expect(result.receiptTitle).toBe("Invoice");
    });

    it("should handle custom logo", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
        true,
        "/path/to/logo.png",
      );

      expect(result.hasCustomLogo).toBe(true);
      expect(result.logoPath).toBe("/path/to/logo.png");
    });

    it("should use custom receipt title", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
        false,
        undefined,
        "Накладна",
      );

      expect(result.receiptTitle).toBe("Накладна");
    });

    it("should handle footer customization", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
        false,
        undefined,
        "Invoice",
        "en",
        "Thank you!",
        "Visit again",
      );

      expect(result.footerTitle).toBe("Thank you!");
      expect(result.footerSubtitle).toBe("Visit again");
    });

    it("should handle recipient without optional fields", () => {
      const orderNoOptionals = {
        ...mockOrder,
        recipient: {
          name: "Jane",
          email: null,
          phone: null,
          address: null,
        },
      };

      const result = service.prepareTemplateData(
        orderNoOptionals,
        "2025-000001",
        { companyName: "Corp" },
      );

      expect(result.recipientName).toBe("Jane");
      expect(result.recipientEmail).toBeUndefined();
      expect(result.recipientPhone).toBeUndefined();
      expect(result.recipientAddress).toBeUndefined();
    });

    it("should format currency values", () => {
      const result = service.prepareTemplateData(mockOrder, "2025-000001", {
        companyName: "Corp",
      });

      expect(result.subtotal).toBe(
        MoneyUtil.formatCentsToCurrency(5000, "UAH"),
      );
      expect(result.total).toBe(MoneyUtil.formatCentsToCurrency(5500, "UAH"));
    });

    it("should handle empty company name", () => {
      const result = service.prepareTemplateData(mockOrder, "2025-000001", {
        companyName: "",
      });

      expect(result.companyName).toBe("");
    });

    it("should use en-US locale for English language", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
        false,
        undefined,
        "Invoice",
        "en",
      );

      const expectedDate = new Date("2025-01-15T10:00:00Z").toLocaleString(
        "en-US",
      );
      expect(result.orderDate).toBe(expectedDate);
    });

    it("should use ru-RU locale for Russian language", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
        false,
        undefined,
        "Invoice",
        "ru",
      );

      const expectedDate = new Date("2025-01-15T10:00:00Z").toLocaleString(
        "ru-RU",
      );
      expect(result.orderDate).toBe(expectedDate);
    });

    it("should use uk-UA locale for Ukrainian language", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
        false,
        undefined,
        "Invoice",
        "uk",
      );

      const expectedDate = new Date("2025-01-15T10:00:00Z").toLocaleString(
        "uk-UA",
      );
      expect(result.orderDate).toBe(expectedDate);
    });

    it("should fallback to en-US locale for unknown language", () => {
      const result = service.prepareTemplateData(
        mockOrder,
        "2025-000001",
        mockCompanyInfo,
        false,
        undefined,
        "Invoice",
        "fr",
      );

      const expectedDate = new Date("2025-01-15T10:00:00Z").toLocaleString(
        "en-US",
      );
      expect(result.orderDate).toBe(expectedDate);
    });
  });

  describe("loadTranslations", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs/promises");

    it("should load flat JSON translations without corporate wrapper", async () => {
      const flatTranslations = JSON.stringify({
        date: "Date:",
        billTo: "Bill To",
        item: "Item",
        qty: "Qty",
        total: "Total",
      });

      fs.readFile.mockResolvedValue(flatTranslations);

      const freshService = new TemplateService();

      // Wait for async loadTranslations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = freshService.prepareTemplateData(
        {
          id: "order-1",
          currency: "UAH",
          created_at: new Date(),
          subtotal_cents: 1000,
          total_cents: 1000,
          recipient: { name: "Test", email: null, phone: null, address: null },
          items: [],
        } as any,
        "2025-000001",
        { companyName: "Corp" },
      );

      expect(result.translations).toBeDefined();
      expect(result.translations.date).toBe("Date:");
      expect(result.translations.billTo).toBe("Bill To");
    });
  });

  describe("loadTemplate", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs/promises");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const _Handlebars = require("handlebars");

    it("should load template from file", async () => {
      fs.access.mockResolvedValueOnce(undefined);
      fs.readFile.mockResolvedValueOnce("<html>template</html>");

      const result = await service.loadTemplate(ReceiptTemplate.STANDARD);

      expect(result).toBeInstanceOf(Function);
    });

    it("should throw if template not found", async () => {
      fs.access.mockRejectedValue(new Error("ENOENT"));

      await expect(
        service.loadTemplate("nonexistent" as ReceiptTemplate),
      ).rejects.toThrow();
    });
  });

  describe("renderTemplate", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs/promises");

    it("should render template with data", async () => {
      fs.access.mockResolvedValueOnce(undefined);
      fs.readFile.mockResolvedValueOnce("<html>{{companyName}}</html>");

      const result = await service.renderTemplate(ReceiptTemplate.STANDARD, {
        companyName: "Test",
      } as any);

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });
  });
});
