import { Optional } from "@nestjs/common";
import { DocumentConfigService } from "./services/document-config.service";
import { DocumentAssetsService } from "./services/document-assets.service";
import { parseSettingsInput, settingsInput } from "./dto/settings-input";
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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import {
  ReceiptDesignResponseDto,
  CompanyInfoResponseDto,
  TemplateInfoDto,
} from "./dto/settings-response.dto";
import { ApiErrors, ApiErrorResponse } from "../../common/errors/ApiError";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { EnvConfig } from "../../config/env.schema";
import { LogoStorageService } from "../../common/services/logo-storage.service";
import { SettingsService } from "./services/settings.service";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import {
  getTemplateCapabilities,
  TEMPLATE_METADATA,
} from "../receipts/templates/metadata";
import { SubscriptionService } from "../subscription/subscription.service";

@ApiTags("settings")
@ApiBearerAuth("bearer")
@Controller("settings")
@UseGuards(JwtAuthGuard)
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private configService: ConfigService<EnvConfig>,
    private logoStorageService: LogoStorageService,
    private settingsService: SettingsService,
    private subscriptionService: SubscriptionService,
    @Optional() private readonly documents?: DocumentConfigService,
    @Optional() private readonly assets?: DocumentAssetsService,
  ) {}

  @Post("logo/upload")
  @UseInterceptors(
    FileInterceptor("logo", {
      fileFilter: (req, file, callback) => {
        if (
          ![
            "image/jpg",
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/svg+xml",
          ].includes(file.mimetype)
        ) {
          return callback(
            ApiErrors.VALIDATION_ERROR("logo", "Use PNG, JPEG, GIF or SVG"),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 0,
        parts: 2,
        headerPairs: 40,
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
      // Загружаем новый логотип в Object Storage
      const version = await this.documents.read(req.user.id);
      const saved = await this.documents.save(
        req.user.id,
        { config: version.config, logoAction: "replace" },
        version.revision,
        file,
      );
      const url = `/settings/logo?revision=${saved.revision}`;

      return {
        message: "Logo uploaded successfully to Object Storage",
        filename: `logo-${req.user.id}.png`,
        originalName: file.originalname,
        size: file.size,
        url: url,
        userId: req.user.id,
      };
    } catch (error) {
      if (error instanceof ApiErrorResponse) throw error;
      throw ApiErrors.FILE_UPLOAD_FAILED("logo");
    }
  }

  @Get("logo")
  async getLogo(@Res() res: Response, @Request() req: { user: User }) {
    try {
      // Получаем логотип пользователя из Object Storage
      const version = await this.documents.read(req.user.id);
      const logoBuffer = await this.assets.preview(req.user.id, {
        config: version.config,
        logoAction: "keep",
      });
      if (!logoBuffer)
        return res.status(404).json({ message: "Logo not found" });

      res.set({
        "Content-Type": "image/png",
        "Content-Length": logoBuffer.length.toString(),
        "Cache-Control": "private, no-store", // Кешируем на 1 час
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

  @Get("logo/exists")
  async checkLogoExists(@Request() req: { user: User }) {
    try {
      const version = await this.documents.read(req.user.id);
      const hasLogo =
        Boolean(version.config.logo.assetId) ||
        (version.revision === 0 &&
          (await this.logoStorageService.userHasLogo(req.user.id)));
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
      const version = await this.documents.read(req.user.id);
      await this.documents.save(
        req.user.id,
        { config: version.config, logoAction: "remove" },
        version.revision,
      );
      return {
        message: "Logo deleted successfully",
        userId: req.user.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to delete logo for user ${req.user.id}: ${error.message}`,
      );
      throw ApiErrors.FILE_DELETE_FAILED("logo");
    }
  }

  @Get("onboarding-status")
  async getOnboardingStatus(@Request() req: { user: User }) {
    const status = await this.settingsService.getOnboardingStatus(req.user.id);
    return { data: status };
  }

  @Post("onboarding-complete")
  async completeOnboarding(@Request() req: { user: User }) {
    await this.settingsService.completeOnboarding(req.user.id);
    return { data: { completed: true } };
  }

  @Get("receipt-design")
  @ApiOperation({ summary: "Get all receipt design settings" })
  @ApiResponse({ status: 200, type: ReceiptDesignResponseDto })
  async getReceiptDesign(@Request() req: { user: User }) {
    const design = await this.settingsService.getReceiptDesignSettings(
      req.user.id,
    );
    return { data: design };
  }

  @Get("templates")
  @ApiOperation({ summary: "Get available receipt templates" })
  @ApiResponse({ status: 200, type: [TemplateInfoDto] })
  async getAvailableTemplates(@Request() req: { user: User }) {
    const allowedIds = await this.subscriptionService.getAllowedTemplateIds(
      req.user.id,
    );

    return {
      data: Object.values(TEMPLATE_METADATA).map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        features: template.features,
        colors: template.colors,
        capabilities: getTemplateCapabilities(template.id),
        locked: allowedIds !== null && !allowedIds.includes(template.id),
      })),
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
    @Body() body: { templateId: string },
  ) {
    const input = parseSettingsInput(settingsInput.template, body);
    await this.subscriptionService.assertCanUseTemplate(
      req.user.id,
      input.templateId,
    );
    await this.settingsService.setUserTemplate(req.user.id, input.templateId);
    return { message: "Template setting updated successfully" };
  }

  @Get("receipt-title")
  async getReceiptTitle(@Request() req: { user: User }) {
    const title = await this.settingsService.getReceiptTitle(req.user.id);
    return { data: { title } };
  }

  @Post("receipt-title")
  async updateReceiptTitle(
    @Request() req: { user: User },
    @Body() body: { title: string },
  ) {
    const input = parseSettingsInput(settingsInput.title, body);
    await this.settingsService.setReceiptTitle(req.user.id, input.title);
    return { message: "Receipt title updated successfully" };
  }

  @Get("template-language")
  async getTemplateLanguage(@Request() req: { user: User }) {
    const language = await this.settingsService.getTemplateLanguage(
      req.user.id,
    );
    return { data: { language } };
  }

  @Post("template-language")
  async updateTemplateLanguage(
    @Request() req: { user: User },
    @Body() body: { language: string },
  ) {
    const input = parseSettingsInput(settingsInput.language, body);
    await this.settingsService.setTemplateLanguage(req.user.id, input.language);
    return { message: "Template language updated successfully" };
  }

  @Get("footer-title")
  async getFooterTitle(@Request() req: { user: User }) {
    const footerTitle = await this.settingsService.getFooterTitle(req.user.id);
    return { data: { footerTitle: footerTitle || "" } };
  }

  @Post("footer-title")
  async updateFooterTitle(
    @Request() req: { user: User },
    @Body() body: { footerTitle: string },
  ) {
    const input = parseSettingsInput(settingsInput.footerTitle, body);
    await this.settingsService.setFooterTitle(req.user.id, input.footerTitle);
    return { message: "Footer title updated successfully" };
  }

  @Get("footer-subtitle")
  async getFooterSubtitle(@Request() req: { user: User }) {
    const footerSubtitle = await this.settingsService.getFooterSubtitle(
      req.user.id,
    );
    return { data: { footerSubtitle: footerSubtitle || "" } };
  }

  @Post("footer-subtitle")
  async updateFooterSubtitle(
    @Request() req: { user: User },
    @Body() body: { footerSubtitle: string },
  ) {
    const input = parseSettingsInput(settingsInput.footerSubtitle, body);
    await this.settingsService.setFooterSubtitle(
      req.user.id,
      input.footerSubtitle,
    );
    return { message: "Footer subtitle updated successfully" };
  }

  @Post("footer")
  async updateFooter(
    @Request() req: { user: User },
    @Body() body: { footerTitle: string; footerSubtitle: string },
  ) {
    const input = parseSettingsInput(settingsInput.footer, body);
    await this.settingsService.setFooter(
      req.user.id,
      input.footerTitle,
      input.footerSubtitle,
    );
    return { message: "Footer updated successfully" };
  }

  @Get("primary-color")
  async getPrimaryColor(@Request() req: { user: User }) {
    const color = await this.settingsService.getPrimaryColor(req.user.id);
    return { data: { primaryColor: color || "" } };
  }

  @Post("primary-color")
  async updatePrimaryColor(
    @Request() req: { user: User },
    @Body() body: { primaryColor: string },
  ) {
    const input = parseSettingsInput(settingsInput.color, body);
    await this.settingsService.setPrimaryColor(req.user.id, input.primaryColor);
    return { message: "Primary color updated successfully" };
  }

  @Get("payment-terms")
  async getPaymentTerms(@Request() req: { user: User }) {
    const terms = await this.settingsService.getPaymentTerms(req.user.id);
    return { data: { paymentTerms: terms || "" } };
  }

  @Post("payment-terms")
  async updatePaymentTerms(
    @Request() req: { user: User },
    @Body() body: { paymentTerms: string },
  ) {
    const input = parseSettingsInput(settingsInput.payment, body);
    await this.settingsService.setPaymentTerms(req.user.id, input.paymentTerms);
    return { message: "Payment terms updated successfully" };
  }

  @Get("delivery-terms")
  async getDeliveryTerms(@Request() req: { user: User }) {
    const terms = await this.settingsService.getDeliveryTerms(req.user.id);
    return { data: { deliveryTerms: terms || "" } };
  }

  @Post("delivery-terms")
  async updateDeliveryTerms(
    @Request() req: { user: User },
    @Body() body: { deliveryTerms: string },
  ) {
    const input = parseSettingsInput(settingsInput.delivery, body);
    await this.settingsService.setDeliveryTerms(
      req.user.id,
      input.deliveryTerms,
    );
    return { message: "Delivery terms updated successfully" };
  }

  @Get("company-info")
  @ApiOperation({ summary: "Get company information" })
  @ApiResponse({ status: 200, type: CompanyInfoResponseDto })
  async getCompanyInfo(@Request() req: { user: User }) {
    const companyInfo = await this.settingsService.getCompanyInfo(req.user.id);
    return { data: companyInfo };
  }

  @Post("company-info")
  async updateCompanyInfo(
    @Request() req: { user: User },
    @Body()
    body: {
      companyName?: string;
      companyAddress?: string;
      companyEmail?: string;
      companyPhone?: string;
      companyTaxId?: string;
      companyIban?: string;
      companySwift?: string;
      companyWebsite?: string;
      companyTagline?: string;
    },
  ) {
    const input = parseSettingsInput(settingsInput.company, body);
    await this.settingsService.updateCompanyInfo(req.user.id, input);
    return { message: "Company information updated successfully" };
  }
}
