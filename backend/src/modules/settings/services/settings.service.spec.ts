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
    receiptTitle: "Invoice",
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

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: "elegant" }),
      );
    });

    it("should create new settings if none exist", async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      await service.setUserTemplate("user-1", "compact");

      expect(settingsRepo.create).toHaveBeenCalledWith({ userId: "user-1" });
      expect(settingsRepo.save).toHaveBeenCalled();
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

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ receiptTitle: "Receipt" }),
      );
    });
  });

  describe("getReceiptTitle / setReceiptTitle", () => {
    it("should return receipt title", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      expect(await service.getReceiptTitle("user-1")).toBe("Invoice");
    });

    it('should default to "Invoice"', async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      expect(await service.getReceiptTitle("user-1")).toBe("Invoice");
    });

    it("should set receipt title", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setReceiptTitle("user-1", "Накладна");

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ receiptTitle: "Накладна" }),
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

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ templateLanguage: "uk" }),
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

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: "New Corp",
          companyPhone: "+9999",
        }),
      );
    });

    it("should only update provided fields", async () => {
      const settings = { ...mockSettings };
      settingsRepo.findOne.mockResolvedValue(settings);

      await service.updateCompanyInfo("user-1", {
        companyName: "Updated",
      });

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: "Updated",
          companyEmail: "info@acme.com", // unchanged
        }),
      );
    });
  });

  describe("setFooterTitle", () => {
    it("should save footerText and invalidate cache", async () => {
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.setFooterTitle("user-1", "Thanks for shopping");

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ footerText: "Thanks for shopping" }),
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

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ subFooterText: "Come back soon" }),
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

      expect(settingsRepo.save).toHaveBeenCalledWith(
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

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ onboardingCompleted: true }),
      );
    });

    it("should invalidate cache after completing onboarding", async () => {
      const cacheService = (service as any).cacheService;
      settingsRepo.findOne.mockResolvedValue({ ...mockSettings });

      await service.completeOnboarding("user-1");

      expect(cacheService.del).toHaveBeenCalledWith("settings:user-1");
    });
  });

  describe("getAllPdfSettings", () => {
    it("should return all PDF-related settings", async () => {
      settingsRepo.findOne.mockResolvedValue(mockSettings);

      const result = await service.getAllPdfSettings("user-1");

      expect(result.templateId).toBe("modern");
      expect(result.receiptTitle).toBe("Invoice");
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
  });
});
