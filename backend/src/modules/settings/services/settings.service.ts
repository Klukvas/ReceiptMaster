import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserSettings } from "../entities/user-settings.entity";
import { CacheService } from "../../../common/services/cache.service";

const SETTINGS_CACHE_TTL = 3600; // 1 hour

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
    private cacheService: CacheService,
  ) {}

  private settingsCacheKey(userId: string): string {
    return `settings:${userId}`;
  }

  private async invalidateCache(userId: string): Promise<void> {
    await this.cacheService.del(this.settingsCacheKey(userId));
  }

  private async getCachedSettings(
    userId: string,
  ): Promise<UserSettings | null> {
    const cached = await this.cacheService.get<UserSettings>(
      this.settingsCacheKey(userId),
    );
    if (cached) return cached;

    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    if (settings) {
      await this.cacheService.set(
        this.settingsCacheKey(userId),
        settings,
        SETTINGS_CACHE_TTL,
      );
    }
    return settings;
  }

  /**
   * Get existing settings for a user, or create a new empty record.
   * Always fetches from DB to avoid mutating cached objects.
   */
  private async getOrCreateSettings(userId: string): Promise<UserSettings> {
    const existing = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    if (existing) return existing;

    const created = this.userSettingsRepository.create({ userId });
    return this.userSettingsRepository.save(created);
  }

  async getUserTemplate(userId: string): Promise<string> {
    const settings = await this.getCachedSettings(userId);
    return settings?.templateId || "standard";
  }

  async setUserTemplate(userId: string, templateId: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({ ...settings, templateId });
    await this.invalidateCache(userId);
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    return this.getCachedSettings(userId);
  }

  async updateUserSettings(
    userId: string,
    updates: Partial<UserSettings>,
  ): Promise<UserSettings> {
    const settings = await this.getOrCreateSettings(userId);
    const merged = { ...settings, ...updates, userId };
    const saved = await this.userSettingsRepository.save(merged);
    await this.invalidateCache(userId);
    return saved;
  }

  async getReceiptTitle(userId: string): Promise<string> {
    const settings = await this.getCachedSettings(userId);
    return settings?.receiptTitle || "Invoice";
  }

  async setReceiptTitle(userId: string, title: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      receiptTitle: title,
    });
    await this.invalidateCache(userId);
  }

  async getTemplateLanguage(userId: string): Promise<string> {
    const settings = await this.getCachedSettings(userId);
    return settings?.templateLanguage || "en";
  }

  async setTemplateLanguage(userId: string, language: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      templateLanguage: language,
    });
    await this.invalidateCache(userId);
  }

  async getFooterTitle(userId: string): Promise<string | undefined> {
    const settings = await this.getCachedSettings(userId);
    return settings?.footerText || undefined;
  }

  async setFooterTitle(userId: string, footerTitle: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      footerText: footerTitle,
    });
    await this.invalidateCache(userId);
  }

  async getFooterSubtitle(userId: string): Promise<string | undefined> {
    const settings = await this.getCachedSettings(userId);
    return settings?.subFooterText || undefined;
  }

  async setFooterSubtitle(
    userId: string,
    footerSubtitle: string,
  ): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      subFooterText: footerSubtitle,
    });
    await this.invalidateCache(userId);
  }

  async getCompanyInfo(userId: string): Promise<Partial<UserSettings>> {
    const settings = await this.getCachedSettings(userId);

    return {
      companyName: settings?.companyName || "",
      companyAddress: settings?.companyAddress || "",
      companyEmail: settings?.companyEmail || "",
      companyPhone: settings?.companyPhone || "",
      companyTaxId: settings?.companyTaxId || "",
      companyIban: settings?.companyIban || "",
      companySwift: settings?.companySwift || "",
      companyWebsite: settings?.companyWebsite || "",
      companyTagline: settings?.companyTagline || "",
    };
  }

  async updateCompanyInfo(
    userId: string,
    companyInfo: Partial<UserSettings>,
  ): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);

    const companyFields: Record<string, unknown> = {};
    if (companyInfo.companyName !== undefined)
      companyFields.companyName = companyInfo.companyName;
    if (companyInfo.companyAddress !== undefined)
      companyFields.companyAddress = companyInfo.companyAddress;
    if (companyInfo.companyEmail !== undefined)
      companyFields.companyEmail = companyInfo.companyEmail;
    if (companyInfo.companyPhone !== undefined)
      companyFields.companyPhone = companyInfo.companyPhone;
    if (companyInfo.companyTaxId !== undefined)
      companyFields.companyTaxId = companyInfo.companyTaxId;
    if (companyInfo.companyIban !== undefined)
      companyFields.companyIban = companyInfo.companyIban;
    if (companyInfo.companySwift !== undefined)
      companyFields.companySwift = companyInfo.companySwift;
    if (companyInfo.companyWebsite !== undefined)
      companyFields.companyWebsite = companyInfo.companyWebsite;
    if (companyInfo.companyTagline !== undefined)
      companyFields.companyTagline = companyInfo.companyTagline;

    await this.userSettingsRepository.save({ ...settings, ...companyFields });
    await this.invalidateCache(userId);
  }

  async getOnboardingStatus(userId: string): Promise<{ completed: boolean }> {
    const settings = await this.getOrCreateSettings(userId);
    return { completed: settings.onboardingCompleted };
  }

  async completeOnboarding(userId: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      onboardingCompleted: true,
    });
    await this.invalidateCache(userId);
  }

  async getPrimaryColor(userId: string): Promise<string | undefined> {
    const settings = await this.getCachedSettings(userId);
    return settings?.primaryColor || undefined;
  }

  async setPrimaryColor(userId: string, color: string): Promise<void> {
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new Error("Invalid hex color value. Must match #RRGGBB format.");
    }
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      primaryColor: color,
    });
    await this.invalidateCache(userId);
  }

  async getPaymentTerms(userId: string): Promise<string | undefined> {
    const settings = await this.getCachedSettings(userId);
    return settings?.paymentTerms || undefined;
  }

  async setPaymentTerms(userId: string, terms: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      paymentTerms: terms,
    });
    await this.invalidateCache(userId);
  }

  async getDeliveryTerms(userId: string): Promise<string | undefined> {
    const settings = await this.getCachedSettings(userId);
    return settings?.deliveryTerms || undefined;
  }

  async setDeliveryTerms(userId: string, terms: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    await this.userSettingsRepository.save({
      ...settings,
      deliveryTerms: terms,
    });
    await this.invalidateCache(userId);
  }

  async getReceiptDesignSettings(userId: string): Promise<{
    receiptTitle: string;
    templateId: string;
    templateLanguage: string;
    footerTitle: string;
    footerSubtitle: string;
    primaryColor: string;
    paymentTerms: string;
    deliveryTerms: string;
  }> {
    const settings = await this.getCachedSettings(userId);
    return {
      receiptTitle: settings?.receiptTitle || "Invoice",
      templateId: settings?.templateId || "standard",
      templateLanguage: settings?.templateLanguage || "en",
      footerTitle: settings?.footerText || "",
      footerSubtitle: settings?.subFooterText || "",
      primaryColor: settings?.primaryColor || "",
      paymentTerms: settings?.paymentTerms || "",
      deliveryTerms: settings?.deliveryTerms || "",
    };
  }

  /**
   * Get all PDF-related settings in a single call (cached).
   * This optimizes the N+1 query problem when generating receipts.
   */
  async getAllPdfSettings(userId: string): Promise<{
    companyInfo: {
      companyName: string;
      companyAddress?: string;
      companyEmail?: string;
      companyPhone?: string;
      companyTaxId?: string;
      companyIban?: string;
      companySwift?: string;
      companyWebsite?: string;
      companyTagline?: string;
    };
    templateId: string;
    receiptTitle: string;
    templateLanguage: string;
    footerTitle?: string;
    footerSubtitle?: string;
    primaryColor?: string;
    paymentTerms?: string;
    deliveryTerms?: string;
  }> {
    const settings = await this.getCachedSettings(userId);

    return {
      companyInfo: {
        companyName: settings?.companyName || "",
        companyAddress: settings?.companyAddress || undefined,
        companyEmail: settings?.companyEmail || undefined,
        companyPhone: settings?.companyPhone || undefined,
        companyTaxId: settings?.companyTaxId || undefined,
        companyIban: settings?.companyIban || undefined,
        companySwift: settings?.companySwift || undefined,
        companyWebsite: settings?.companyWebsite || undefined,
        companyTagline: settings?.companyTagline || undefined,
      },
      templateId: settings?.templateId || "standard",
      receiptTitle: settings?.receiptTitle || "Invoice",
      templateLanguage: settings?.templateLanguage || "en",
      footerTitle: settings?.footerText || undefined,
      footerSubtitle: settings?.subFooterText || undefined,
      primaryColor: settings?.primaryColor || undefined,
      paymentTerms: settings?.paymentTerms || undefined,
      deliveryTerms: settings?.deliveryTerms || undefined,
    };
  }
}
