import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SettingsService } from "./settings.service";
import { UserSettings } from "../entities/user-settings.entity";
import { CacheService } from "../../../common/services/cache.service";

describe("SettingsService", () => {
  let service: SettingsService;
  let settingsRepo: any;

  const mockSettings: Partial<UserSettings> = {
    id: "settings-1",
    userId: "user-1",
    templateId: "modern",
    receiptTitle: null,
    templateLanguage: "en",
    footerText: "Thank you",
    subFooterText: "Visit again",
    companyName: "ACME Corp",
    companyAddress: "123 Main St",
    companyEmail: "info@acme.com",
    companyPhone: "+1234567890",
    companyTaxId: "TAX123",
    companyIban: "UA12345678",
    companySwift: "SWIFT123",
    companyWebsite: "https://acme.com",
    companyTagline: "Quality products",
  };

  beforeEach(async () => {
    settingsRepo = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn().mockResolvedValue(mockSettings),
      upsert: jest.fn().mockResolvedValue({}),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "settings-1", ...data })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(UserSettings), useValue: settingsRepo },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe("getUserTemplate", () => {
    it("should return template when settings exist", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      const result = await service.getUserTemplate("user-1");

      expect(result).toBe("modern");
    });

    it('should return "standard" when no settings', async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      const result = await service.getUserTemplate("user-1");

      expect(result).toBe("standard");
    });
  });

  describe("setUserTemplate", () => {
    it("should update existing settings", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setUserTemplate("user-1", "elegant");

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: "elegant" }),
        ["userId"],
      );
    });

    it("should create new settings if none exist", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      await service.setUserTemplate("user-1", "compact");

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        { userId: "user-1", templateId: "compact" },
        ["userId"],
      );
    });
  });

  describe("getUserSettings", () => {
    it("should return settings or null", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      const result = await service.getUserSettings("user-1");

      expect(result).toEqual(mockSettings);
    });

    it("should return null when no settings", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      const result = await service.getUserSettings("user-1");

      expect(result).toBeNull();
    });
  });

  describe("updateUserSettings", () => {
    it("should merge updates into existing settings", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.updateUserSettings("user-1", {
        receiptTitle: "Receipt",
      });

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ receiptTitle: "Receipt" }),
        ["userId"],
      );
    });
  });

  describe("getReceiptTitle / setReceiptTitle", () => {
    it("should return custom receipt title when set", async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: "Custom Title",
      });

      expect(await service.getReceiptTitle("user-1")).toBe("Custom Title");
    });

    it('should default to "Invoice" when no settings exist', async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      expect(await service.getReceiptTitle("user-1")).toBe("Invoice");
    });

    it('should default to "Invoice" when receiptTitle is null and language is en', async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: null,
        templateLanguage: "en",
      });

      expect(await service.getReceiptTitle("user-1")).toBe("Invoice");
    });

    it('should default to "Інвойс" when receiptTitle is null and language is uk', async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: null,
        templateLanguage: "uk",
      });

      expect(await service.getReceiptTitle("user-1")).toBe("Інвойс");
    });

    it('should default to "Инвойс" when receiptTitle is null and language is ru', async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: null,
        templateLanguage: "ru",
      });

      expect(await service.getReceiptTitle("user-1")).toBe("Инвойс");
    });

    it("should fallback to English default for unknown language", async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: null,
        templateLanguage: "fr",
      });

      expect(await service.getReceiptTitle("user-1")).toBe("Invoice");
    });

    it("should set receipt title", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setReceiptTitle("user-1", "Накладна");

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ receiptTitle: "Накладна" }),
        ["userId"],
      );
    });
  });

  describe("getTemplateLanguage / setTemplateLanguage", () => {
    it("should return template language", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      expect(await service.getTemplateLanguage("user-1")).toBe("en");
    });

    it('should default to "en"', async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      expect(await service.getTemplateLanguage("user-1")).toBe("en");
    });

    it("should set template language", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setTemplateLanguage("user-1", "uk");

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ templateLanguage: "uk" }),
        ["userId"],
      );
    });
  });

  describe("getFooterTitle / setFooterTitle", () => {
    it("should return footer title", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      expect(await service.getFooterTitle("user-1")).toBe("Thank you");
    });

    it("should return undefined when no settings", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      expect(await service.getFooterTitle("user-1")).toBeUndefined();
    });
  });

  describe("getFooterSubtitle / setFooterSubtitle", () => {
    it("should return footer subtitle", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      expect(await service.getFooterSubtitle("user-1")).toBe("Visit again");
    });

    it("should return undefined when no settings", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      expect(await service.getFooterSubtitle("user-1")).toBeUndefined();
    });
  });

  describe("getCompanyInfo", () => {
    it("should return company info from settings", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      const result = await service.getCompanyInfo("user-1");

      expect(result.companyName).toBe("ACME Corp");
      expect(result.companyAddress).toBe("123 Main St");
      expect(result.companyEmail).toBe("info@acme.com");
    });

    it("should return empty strings when no settings", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      const result = await service.getCompanyInfo("user-1");

      expect(result.companyName).toBe("");
      expect(result.companyAddress).toBe("");
    });
  });

  describe("updateCompanyInfo", () => {
    it("should update company info fields", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.updateCompanyInfo("user-1", {
        companyName: "New Corp",
        companyPhone: "+9999",
      });

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: "New Corp",
          companyPhone: "+9999",
        }),
        ["userId"],
      );
    });

    it("should only update provided fields", async () => {
      const settings = { ...mockSettings };
      settingsRepo.findOne.mockResolvedValue(settings);

      await service.updateCompanyInfo("user-1", {
        companyName: "Updated",
      });

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: "Updated",
          // Only provided fields are written; untouched columns stay in the database.
        }),
        ["userId"],
      );
    });
  });

  describe("setFooterTitle", () => {
    it("should save footerText and invalidate cache", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setFooterTitle("user-1", "Thanks for shopping");

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ footerText: "Thanks for shopping" }),
        ["userId"],
      );
    });

    it("should invalidate cache after saving", async () => {
      const cacheService = (service as any).cacheService;
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setFooterTitle("user-1", "Footer text");

      expect(cacheService.del).toHaveBeenCalledWith("settings:user-1");
    });
  });

  describe("setFooterSubtitle", () => {
    it("should save subFooterText and invalidate cache", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setFooterSubtitle("user-1", "Come back soon");

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ subFooterText: "Come back soon" }),
        ["userId"],
      );
    });

    it("should invalidate cache after saving", async () => {
      const cacheService = (service as any).cacheService;
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setFooterSubtitle("user-1", "Subtitle text");

      expect(cacheService.del).toHaveBeenCalledWith("settings:user-1");
    });
  });

  describe("updateCompanyInfo — all fields", () => {
    it("should update all company fields when all are provided", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.updateCompanyInfo("user-1", {
        companyAddress: "456 Oak Ave",
        companyEmail: "new@corp.com",
        companyPhone: "+0987654321",
        companyTaxId: "TAX999",
        companyIban: "UA99887766",
        companySwift: "NEWSWIFT",
        companyWebsite: "https://newcorp.com",
        companyTagline: "Better every day",
      });

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          companyAddress: "456 Oak Ave",
          companyEmail: "new@corp.com",
          companyPhone: "+0987654321",
          companyTaxId: "TAX999",
          companyIban: "UA99887766",
          companySwift: "NEWSWIFT",
          companyWebsite: "https://newcorp.com",
          companyTagline: "Better every day",
        }),
        ["userId"],
      );
    });

    it("should invalidate cache after updating company info", async () => {
      const cacheService = (service as any).cacheService;
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.updateCompanyInfo("user-1", {
        companyAddress: "789 Elm St",
      });

      expect(cacheService.del).toHaveBeenCalledWith("settings:user-1");
    });
  });

  describe("getOnboardingStatus", () => {
    it("should return completed: true when onboarding is done", async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        onboardingCompleted: true,
      });

      const result = await service.getOnboardingStatus("user-1");

      expect(result).toEqual({ completed: true });
    });

    it("should return completed: false when onboarding is not done", async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        onboardingCompleted: false,
      });

      const result = await service.getOnboardingStatus("user-1");

      expect(result).toEqual({ completed: false });
    });
  });

  describe("completeOnboarding", () => {
    it("should save onboardingCompleted as true", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.completeOnboarding("user-1");

      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ onboardingCompleted: true }),
        ["userId"],
      );
    });

    it("should invalidate cache after completing onboarding", async () => {
      const cacheService = (service as any).cacheService;
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.completeOnboarding("user-1");

      expect(cacheService.del).toHaveBeenCalledWith("settings:user-1");
    });
  });

  describe("autoGenerateReceipt", () => {
    it("defaults to false when the user has no settings row", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      await expect(service.getAutoGenerateReceipt("user-1")).resolves.toBe(
        false,
      );
    });

    it("saves the flag directly, bypassing the document-config path", async () => {
      const documents = { patchLegacy: jest.fn() };
      const cache = { del: jest.fn() };
      const withDocuments = new SettingsService(
        settingsRepo,
        cache as any,
        documents as any,
      );

      await withDocuments.setAutoGenerateReceipt("user-1", true);

      expect(documents.patchLegacy).not.toHaveBeenCalled();
      expect(settingsRepo.upsert).toHaveBeenCalledWith(
        { autoGenerateReceipt: true, userId: "user-1" },
        ["userId"],
      );
      expect(cache.del).toHaveBeenCalledWith("settings:user-1");
    });
  });

  describe("getAllPdfSettings", () => {
    it.each([
      ["en", "Invoice"],
      ["ru", "Инвойс"],
      ["uk", "Інвойс"],
    ])(
      "preserves stored title provenance for %s even when it equals the default",
      async (language, title) => {
        settingsRepo.findOne.mockResolvedValue({
          ...mockSettings,
          receiptTitle: title,
          templateLanguage: language,
        });
        const settings = await service.getAllPdfSettings("user-1");
        expect(settings).toMatchObject({
          receiptTitle: title,
          hasCustomReceiptTitle: true,
        });
      },
    );

    it("should return all PDF-related settings with custom title", async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: "My Invoice",
      });

      const result = await service.getAllPdfSettings("user-1");

      expect(result.templateId).toBe("modern");
      expect(result.receiptTitle).toBe("My Invoice");
      expect(result.templateLanguage).toBe("en");
      expect(result.footerTitle).toBe("Thank you");
      expect(result.companyInfo.companyName).toBe("ACME Corp");
    });

    it("should return defaults when no settings", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      const result = await service.getAllPdfSettings("user-1");

      expect(result.templateId).toBe("standard");
      expect(result.receiptTitle).toBe("Invoice");
      expect(result.templateLanguage).toBe("en");
      expect(result.companyInfo.companyName).toBe("");
    });

    it("should return Ukrainian default title when language is uk and no custom title", async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: null,
        templateLanguage: "uk",
      });

      const result = await service.getAllPdfSettings("user-1");

      expect(result.receiptTitle).toBe("Інвойс");
      expect(result.templateLanguage).toBe("uk");
    });

    it("should return Russian default title when language is ru and no custom title", async () => {
      settingsRepo.findOne.mockResolvedValue({
        ...mockSettings,
        receiptTitle: null,
        templateLanguage: "ru",
      });

      const result = await service.getAllPdfSettings("user-1");

      expect(result.receiptTitle).toBe("Инвойс");
      expect(result.templateLanguage).toBe("ru");
    });
  });
});
