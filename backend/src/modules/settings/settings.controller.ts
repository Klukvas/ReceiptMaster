import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Res,
  Body,
  UseGuards,
  Request,
  Logger,
} from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs/promises";
import * as path from "path";
import { EnvConfig } from "../../config/env.schema";
import { LogoStorageService } from "../../common/services/logo-storage.service";
import { SettingsService } from "./services/settings.service";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { TEMPLATE_METADATA } from "../receipts/templates/metadata";

@Controller("settings")
@UseGuards(JwtAuthGuard)
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private configService: ConfigService<EnvConfig>,
    private logoStorageService: LogoStorageService,
    private settingsService: SettingsService,
  ) {}

  @Post("logo/upload")
  @UseInterceptors(
    FileInterceptor("logo", {
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|svg)$/)) {
          return callback(new Error("Only image files are allowed!"), false);
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: User },
  ) {
    if (!file) {
      throw ApiErrors.REQUIRED_FIELD_MISSING("logo file");
    }

    try {
      // Удаляем старый логотип пользователя, если он существует
      try {
        await this.logoStorageService.deleteUserLogo(req.user.id);
      } catch (error) {
        // Игнорируем ошибку, если логотип не найден
        this.logger.log("No existing logo to delete for user:", req.user.id);
      }

      // Загружаем новый логотип в Object Storage
      const url = await this.logoStorageService.uploadLogo(
        file.buffer,
        req.user.id,
      );

      return {
        message: "Logo uploaded successfully to Object Storage",
        filename: `logo-${req.user.id}.png`,
        originalName: file.originalname,
        size: file.size,
        url: url,
        userId: req.user.id,
      };
    } catch (error) {
      throw ApiErrors.FILE_UPLOAD_FAILED("logo");
    }
  }

  @Get("logo")
  async getLogo(@Res() res: Response, @Request() req: { user: User }) {
    try {
      // Получаем логотип пользователя из Object Storage
      const logoBuffer = await this.logoStorageService.downloadLogo(
        req.user.id,
      );

      res.set({
        "Content-Type": "image/png",
        "Content-Length": logoBuffer.length.toString(),
        "Cache-Control": "public, max-age=3600", // Кешируем на 1 час
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key",
        "Access-Control-Expose-Headers": "Content-Type, Content-Length",
      });
      res.send(logoBuffer);
    } catch (error) {
      this.logger.error("Failed to retrieve logo from Object Storage:", error);
      return res.status(404).json({ message: "Logo not found" });
    }
  }

  @Post("company-name")
  async updateCompanyName(@Body() body: { companyName: string }) {
    try {
      const settingsPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "settings.json",
      );
      const settings = {
        companyName: body.companyName || "", // Allow empty company name
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

      return {
        message: "Company name updated successfully",
        companyName: settings.companyName,
      };
    } catch (error) {
      throw ApiErrors.INVALID_SETTINGS("company name");
    }
  }

  @Get("company-name")
  async getCompanyName() {
    try {
      const settingsPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "settings.json",
      );

      try {
        const settingsData = await fs.readFile(settingsPath, "utf-8");
        const settings = JSON.parse(settingsData);
        return {
          companyName: settings.companyName || "",
        };
      } catch {
        // If settings file doesn't exist, return empty string
        return {
          companyName: "",
        };
      }
    } catch (error) {
      throw ApiErrors.SETTINGS_NOT_FOUND();
    }
  }

  @Get("logo/exists")
  async checkLogoExists(@Request() req: { user: User }) {
    try {
      const hasLogo = await this.logoStorageService.userHasLogo(req.user.id);
      return {
        hasLogo,
        userId: req.user.id,
        message: hasLogo ? "Logo exists" : "No logo found",
      };
    } catch (error) {
      throw ApiErrors.INTERNAL_SERVER_ERROR("Failed to check logo existence");
    }
  }

  @Post("logo/delete")
  async deleteLogo(@Request() req: { user: User }) {
    try {
      await this.logoStorageService.deleteUserLogo(req.user.id);
      return {
        message: "Logo deleted successfully",
        userId: req.user.id,
      };
    } catch (error) {
      if (error.message.includes("No logo found")) {
        return {
          message: "Logo not found",
          userId: req.user.id,
        };
      }
      throw ApiErrors.FILE_DELETE_FAILED("logo");
    }
  }

  @Get("templates")
  getAvailableTemplates() {
    return {
      data: Object.values(TEMPLATE_METADATA).map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        features: template.features,
        colors: template.colors
      }))
    };
  }

  @Get("template")
  async getTemplateSettings(@Request() req: { user: User }) {
    const templateId = await this.settingsService.getUserTemplate(req.user.id);
    this.logger.log(`Getting template for user ${req.user.id}: ${templateId}`);
    return { data: { templateId } };
  }

  @Post("template")
  async updateTemplateSettings(
    @Request() req: { user: User },
    @Body() body: { templateId: string }
  ) {
    await this.settingsService.setUserTemplate(req.user.id, body.templateId);
    return { message: 'Template setting updated successfully' };
  }

  @Get("receipt-title")
  async getReceiptTitle(@Request() req: { user: User }) {
    const title = await this.settingsService.getReceiptTitle(req.user.id);
    return { data: { title } };
  }

  @Post("receipt-title")
  async updateReceiptTitle(
    @Request() req: { user: User },
    @Body() body: { title: string }
  ) {
    await this.settingsService.setReceiptTitle(req.user.id, body.title);
    return { message: 'Receipt title updated successfully' };
  }

  @Get("template-language")
  async getTemplateLanguage(@Request() req: { user: User }) {
    const language = await this.settingsService.getTemplateLanguage(req.user.id);
    return { data: { language } };
  }

  @Post("template-language")
  async updateTemplateLanguage(
    @Request() req: { user: User },
    @Body() body: { language: string }
  ) {
    await this.settingsService.setTemplateLanguage(req.user.id, body.language);
    return { message: 'Template language updated successfully' };
  }

  @Get("footer-title")
  async getFooterTitle(@Request() req: { user: User }) {
    const footerTitle = await this.settingsService.getFooterTitle(req.user.id);
    return { data: { footerTitle: footerTitle || '' } };
  }

  @Post("footer-title")
  async updateFooterTitle(
    @Request() req: { user: User },
    @Body() body: { footerTitle: string }
  ) {
    await this.settingsService.setFooterTitle(req.user.id, body.footerTitle);
    return { message: 'Footer title updated successfully' };
  }

  @Get("footer-subtitle")
  async getFooterSubtitle(@Request() req: { user: User }) {
    const footerSubtitle = await this.settingsService.getFooterSubtitle(req.user.id);
    return { data: { footerSubtitle: footerSubtitle || '' } };
  }

  @Post("footer-subtitle")
  async updateFooterSubtitle(
    @Request() req: { user: User },
    @Body() body: { footerSubtitle: string }
  ) {
    await this.settingsService.setFooterSubtitle(req.user.id, body.footerSubtitle);
    return { message: 'Footer subtitle updated successfully' };
  }

  @Get("header-title")
  async getHeaderTitle(@Request() req: { user: User }) {
    const headerTitle = await this.settingsService.getHeaderTitle(req.user.id);
    return { data: { headerTitle: headerTitle || '' } };
  }

  @Post("header-title")
  async updateHeaderTitle(
    @Request() req: { user: User },
    @Body() body: { headerTitle: string }
  ) {
    await this.settingsService.setHeaderTitle(req.user.id, body.headerTitle);
    return { message: 'Header title updated successfully' };
  }
}
