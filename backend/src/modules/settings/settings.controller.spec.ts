import { SettingsController } from "./settings.controller";
import { SettingsService } from "./services/settings.service";
import { LogoStorageService } from "../../common/services/logo-storage.service";
import { ConfigService } from "@nestjs/config";
import { User } from "../users/entities/user.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { SubscriptionService } from "../subscription/subscription.service";

jest.mock("../receipts/templates/metadata", () => ({
  TEMPLATE_METADATA: {
    standard: {
      id: "standard",
      name: "Standard",
      description: "Standard receipt",
      category: "basic",
      features: ["clean"],
      colors: { primary: "#000" },
    },
    modern: {
      id: "modern",
      name: "Modern",
      description: "Modern receipt",
      category: "premium",
      features: ["gradient"],
      colors: { primary: "#333" },
    },
  },
}));

describe("SettingsController", () => {
  let controller: SettingsController;
  let settingsService: jest.Mocked<SettingsService>;
  let logoStorageService: jest.Mocked<LogoStorageService>;
  let configService: jest.Mocked<ConfigService>;
  let subscriptionService: jest.Mocked<SubscriptionService>;
  const mockUser = { id: "user-1" } as User;
  const mockReq = { user: mockUser };

  beforeEach(() => {
    settingsService = {
      getUserTemplate: jest.fn().mockResolvedValue("standard"),
      setUserTemplate: jest.fn().mockResolvedValue(undefined),
      getReceiptTitle: jest.fn().mockResolvedValue("Invoice"),
      setReceiptTitle: jest.fn().mockResolvedValue(undefined),
      getTemplateLanguage: jest.fn().mockResolvedValue("en"),
      setTemplateLanguage: jest.fn().mockResolvedValue(undefined),
      getFooterTitle: jest.fn().mockResolvedValue("Thank you"),
      setFooterTitle: jest.fn().mockResolvedValue(undefined),
      getFooterSubtitle: jest.fn().mockResolvedValue("Visit again"),
      setFooterSubtitle: jest.fn().mockResolvedValue(undefined),
      getCompanyInfo: jest.fn().mockResolvedValue({ companyName: "ACME" }),
      updateCompanyInfo: jest.fn().mockResolvedValue(undefined),
    } as any;

    logoStorageService = {
      uploadLogo: jest
        .fn()
        .mockResolvedValue("https://s3.example.com/logo.png"),
      downloadLogo: jest.fn().mockResolvedValue(Buffer.from("fake-image")),
      deleteUserLogo: jest.fn().mockResolvedValue(undefined),
      userHasLogo: jest.fn().mockResolvedValue(true),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    subscriptionService = {
      getAllowedTemplateIds: jest.fn().mockResolvedValue(null),
      assertCanUseTemplate: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new SettingsController(
      configService,
      logoStorageService,
      settingsService,
      subscriptionService,
    );
  });

  describe("uploadLogo", () => {
    it("should upload a logo file", async () => {
      const file = {
        buffer: Buffer.from("image-data"),
        originalname: "logo.png",
        size: 1024,
      } as Express.Multer.File;

      const result = await controller.uploadLogo(file, mockReq);

      expect(result.message).toBe(
        "Logo uploaded successfully to Object Storage",
      );
      expect(result.url).toBe("https://s3.example.com/logo.png");
      expect(result.userId).toBe("user-1");
    });

    it("should throw if no file provided", async () => {
      await expect(
        controller.uploadLogo(undefined as any, mockReq),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should delete old logo before uploading new one", async () => {
      const file = {
        buffer: Buffer.from("image-data"),
        originalname: "logo.png",
        size: 1024,
      } as Express.Multer.File;

      await controller.uploadLogo(file, mockReq);

      expect(logoStorageService.deleteUserLogo).toHaveBeenCalledWith("user-1");
      expect(logoStorageService.uploadLogo).toHaveBeenCalled();
    });

    it("should handle error when no existing logo to delete", async () => {
      logoStorageService.deleteUserLogo.mockRejectedValue(
        new Error("Not found"),
      );
      const file = {
        buffer: Buffer.from("image-data"),
        originalname: "logo.png",
        size: 1024,
      } as Express.Multer.File;

      const result = await controller.uploadLogo(file, mockReq);

      expect(result.url).toBe("https://s3.example.com/logo.png");
    });

    it("should throw if upload fails", async () => {
      logoStorageService.deleteUserLogo.mockResolvedValue(undefined);
      logoStorageService.uploadLogo.mockRejectedValue(
        new Error("Upload failed"),
      );

      const file = {
        buffer: Buffer.from("image-data"),
        originalname: "logo.png",
        size: 1024,
      } as Express.Multer.File;

      await expect(controller.uploadLogo(file, mockReq)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("getLogo", () => {
    it("should return logo buffer with correct headers", async () => {
      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getLogo(mockRes, mockReq);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "image/png",
        }),
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it("should return 404 if logo not found", async () => {
      logoStorageService.downloadLogo.mockRejectedValue(new Error("Not found"));

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getLogo(mockRes, mockReq);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "Logo not found" });
    });
  });

  describe("checkLogoExists", () => {
    it("should return hasLogo true when logo exists", async () => {
      logoStorageService.userHasLogo.mockResolvedValue(true);

      const result = await controller.checkLogoExists(mockReq);

      expect(result.hasLogo).toBe(true);
      expect(result.userId).toBe("user-1");
    });

    it("should return hasLogo false when no logo", async () => {
      logoStorageService.userHasLogo.mockResolvedValue(false);

      const result = await controller.checkLogoExists(mockReq);

      expect(result.hasLogo).toBe(false);
    });

    it("should throw on error", async () => {
      logoStorageService.userHasLogo.mockRejectedValue(new Error("S3 error"));

      await expect(controller.checkLogoExists(mockReq)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("deleteLogo", () => {
    it("should delete logo successfully", async () => {
      const result = await controller.deleteLogo(mockReq);

      expect(logoStorageService.deleteUserLogo).toHaveBeenCalledWith("user-1");
      expect(result.message).toBe("Logo deleted successfully");
    });

    it("should throw on delete failure", async () => {
      logoStorageService.deleteUserLogo.mockRejectedValue(
        new Error("Delete failed"),
      );

      await expect(controller.deleteLogo(mockReq)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("getAvailableTemplates", () => {
    it("should return list of templates with locked field", async () => {
      const result = await controller.getAvailableTemplates(mockReq);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty("id");
      expect(result.data[0]).toHaveProperty("name");
      expect(result.data[0]).toHaveProperty("description");
      expect(result.data[0]).toHaveProperty("locked");
    });
  });

  describe("template settings", () => {
    it("getTemplateSettings should return templateId", async () => {
      const result = await controller.getTemplateSettings(mockReq);

      expect(result.data.templateId).toBe("standard");
    });

    it("updateTemplateSettings should call service", async () => {
      const result = await controller.updateTemplateSettings(mockReq, {
        templateId: "modern",
      });

      expect(settingsService.setUserTemplate).toHaveBeenCalledWith(
        "user-1",
        "modern",
      );
      expect(result.message).toBe("Template setting updated successfully");
    });
  });

  describe("receipt title", () => {
    it("getReceiptTitle should return title", async () => {
      const result = await controller.getReceiptTitle(mockReq);

      expect(result.data.title).toBe("Invoice");
    });

    it("updateReceiptTitle should call service", async () => {
      const result = await controller.updateReceiptTitle(mockReq, {
        title: "Накладна",
      });

      expect(settingsService.setReceiptTitle).toHaveBeenCalledWith(
        "user-1",
        "Накладна",
      );
      expect(result.message).toBe("Receipt title updated successfully");
    });
  });

  describe("template language", () => {
    it("getTemplateLanguage should return language", async () => {
      const result = await controller.getTemplateLanguage(mockReq);

      expect(result.data.language).toBe("en");
    });

    it("updateTemplateLanguage should call service", async () => {
      await controller.updateTemplateLanguage(mockReq, { language: "uk" });

      expect(settingsService.setTemplateLanguage).toHaveBeenCalledWith(
        "user-1",
        "uk",
      );
    });
  });

  describe("footer title", () => {
    it("getFooterTitle should return title", async () => {
      const result = await controller.getFooterTitle(mockReq);

      expect(result.data.footerTitle).toBe("Thank you");
    });

    it("updateFooterTitle should call service", async () => {
      await controller.updateFooterTitle(mockReq, {
        footerTitle: "New footer",
      });

      expect(settingsService.setFooterTitle).toHaveBeenCalledWith(
        "user-1",
        "New footer",
      );
    });
  });

  describe("footer subtitle", () => {
    it("getFooterSubtitle should return subtitle", async () => {
      const result = await controller.getFooterSubtitle(mockReq);

      expect(result.data.footerSubtitle).toBe("Visit again");
    });

    it("updateFooterSubtitle should call service", async () => {
      await controller.updateFooterSubtitle(mockReq, {
        footerSubtitle: "New sub",
      });

      expect(settingsService.setFooterSubtitle).toHaveBeenCalledWith(
        "user-1",
        "New sub",
      );
    });
  });

  describe("company info", () => {
    it("getCompanyInfo should return company data", async () => {
      const result = await controller.getCompanyInfo(mockReq);

      expect(result.data).toEqual({ companyName: "ACME" });
    });

    it("updateCompanyInfo should call service", async () => {
      await controller.updateCompanyInfo(mockReq, {
        companyName: "New Corp",
        companyPhone: "+999",
      });

      expect(settingsService.updateCompanyInfo).toHaveBeenCalledWith("user-1", {
        companyName: "New Corp",
        companyPhone: "+999",
      });
    });
  });
});
