import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettings } from '../entities/user-settings.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
  ) {}

  /**
   * Get existing settings for a user, or create a new empty record.
   * All setter methods use this to avoid duplicating the getOrCreate logic.
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
    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    return settings?.templateId || 'standard';
  }

  async setUserTemplate(userId: string, templateId: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    settings.templateId = templateId;
    await this.userSettingsRepository.save(settings);
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    return this.userSettingsRepository.findOne({
      where: { userId },
    });
  }

  async updateUserSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
    const settings = await this.getOrCreateSettings(userId);
    Object.assign(settings, updates);
    return this.userSettingsRepository.save(settings);
  }

  async getReceiptTitle(userId: string): Promise<string> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    return settings?.receiptTitle || 'Invoice';
  }

  async setReceiptTitle(userId: string, title: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    settings.receiptTitle = title;
    await this.userSettingsRepository.save(settings);
  }

  async getTemplateLanguage(userId: string): Promise<string> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    return settings?.templateLanguage || 'en';
  }

  async setTemplateLanguage(userId: string, language: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    settings.templateLanguage = language;
    await this.userSettingsRepository.save(settings);
  }

  async getFooterTitle(userId: string): Promise<string | undefined> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    return settings?.footerText || undefined;
  }

  async setFooterTitle(userId: string, footerTitle: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    settings.footerText = footerTitle;
    await this.userSettingsRepository.save(settings);
  }

  async getFooterSubtitle(userId: string): Promise<string | undefined> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    return settings?.subFooterText || undefined;
  }

  async setFooterSubtitle(userId: string, footerSubtitle: string): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);
    settings.subFooterText = footerSubtitle;
    await this.userSettingsRepository.save(settings);
  }

  async getCompanyInfo(userId: string): Promise<Partial<UserSettings>> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });

    return {
      companyName: settings?.companyName || '',
      companyAddress: settings?.companyAddress || '',
      companyEmail: settings?.companyEmail || '',
      companyPhone: settings?.companyPhone || '',
      companyTaxId: settings?.companyTaxId || '',
      companyIban: settings?.companyIban || '',
      companySwift: settings?.companySwift || '',
      companyWebsite: settings?.companyWebsite || '',
      companyTagline: settings?.companyTagline || '',
    };
  }

  async updateCompanyInfo(userId: string, companyInfo: Partial<UserSettings>): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);

    if (companyInfo.companyName !== undefined) settings.companyName = companyInfo.companyName;
    if (companyInfo.companyAddress !== undefined) settings.companyAddress = companyInfo.companyAddress;
    if (companyInfo.companyEmail !== undefined) settings.companyEmail = companyInfo.companyEmail;
    if (companyInfo.companyPhone !== undefined) settings.companyPhone = companyInfo.companyPhone;
    if (companyInfo.companyTaxId !== undefined) settings.companyTaxId = companyInfo.companyTaxId;
    if (companyInfo.companyIban !== undefined) settings.companyIban = companyInfo.companyIban;
    if (companyInfo.companySwift !== undefined) settings.companySwift = companyInfo.companySwift;
    if (companyInfo.companyWebsite !== undefined) settings.companyWebsite = companyInfo.companyWebsite;
    if (companyInfo.companyTagline !== undefined) settings.companyTagline = companyInfo.companyTagline;

    await this.userSettingsRepository.save(settings);
  }

  /**
   * Get all PDF-related settings in a single database query.
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
  }> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId },
    });

    return {
      companyInfo: {
        companyName: settings?.companyName || '',
        companyAddress: settings?.companyAddress || undefined,
        companyEmail: settings?.companyEmail || undefined,
        companyPhone: settings?.companyPhone || undefined,
        companyTaxId: settings?.companyTaxId || undefined,
        companyIban: settings?.companyIban || undefined,
        companySwift: settings?.companySwift || undefined,
        companyWebsite: settings?.companyWebsite || undefined,
        companyTagline: settings?.companyTagline || undefined,
      },
      templateId: settings?.templateId || 'standard',
      receiptTitle: settings?.receiptTitle || 'Invoice',
      templateLanguage: settings?.templateLanguage || 'en',
      footerTitle: settings?.footerText || undefined,
      footerSubtitle: settings?.subFooterText || undefined,
    };
  }
}
