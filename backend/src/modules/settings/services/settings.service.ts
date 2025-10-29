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

  async getUserTemplate(userId: string): Promise<string> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    const templateId = settings?.templateId || 'standard';
    console.log(`getUserTemplate for user ${userId}: found settings:`, settings, 'returning templateId:', templateId);
    return templateId;
  }

  async setUserTemplate(userId: string, templateId: string): Promise<void> {
    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    if (existingSettings) {
      existingSettings.templateId = templateId;
      await this.userSettingsRepository.save(existingSettings);
    } else {
      const newSettings = this.userSettingsRepository.create({
        userId,
        templateId
      });
      await this.userSettingsRepository.save(newSettings);
    }
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    return this.userSettingsRepository.findOne({
      where: { userId }
    });
  }

  async updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    if (existingSettings) {
      Object.assign(existingSettings, settings);
      return this.userSettingsRepository.save(existingSettings);
    } else {
      const newSettings = this.userSettingsRepository.create({
        userId,
        ...settings
      });
      return this.userSettingsRepository.save(newSettings);
    }
  }

  async getReceiptTitle(userId: string): Promise<string> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId }
    });
    return settings?.receiptTitle || 'Invoice';
  }

  async setReceiptTitle(userId: string, title: string): Promise<void> {
    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    if (existingSettings) {
      existingSettings.receiptTitle = title;
      await this.userSettingsRepository.save(existingSettings);
    } else {
      const newSettings = this.userSettingsRepository.create({
        userId,
        receiptTitle: title
      });
      await this.userSettingsRepository.save(newSettings);
    }
  }

  async getTemplateLanguage(userId: string): Promise<string> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId }
    });
    return settings?.templateLanguage || 'en';
  }

  async getFooterTitle(userId: string): Promise<string | undefined> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId }
    });
    return settings?.footerText || undefined;
  }

  async getFooterSubtitle(userId: string): Promise<string | undefined> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId }
    });
    return settings?.subFooterText || undefined;
  }

  async setFooterTitle(userId: string, footerTitle: string): Promise<void> {
    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    if (existingSettings) {
      existingSettings.footerText = footerTitle;
      await this.userSettingsRepository.save(existingSettings);
    } else {
      const newSettings = this.userSettingsRepository.create({
        userId,
        footerText: footerTitle
      });
      await this.userSettingsRepository.save(newSettings);
    }
  }

  async setFooterSubtitle(userId: string, footerSubtitle: string): Promise<void> {
    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    if (existingSettings) {
      existingSettings.subFooterText = footerSubtitle;
      await this.userSettingsRepository.save(existingSettings);
    } else {
      const newSettings = this.userSettingsRepository.create({
        userId,
        subFooterText: footerSubtitle
      });
      await this.userSettingsRepository.save(newSettings);
    }
  }

  async setTemplateLanguage(userId: string, language: string): Promise<void> {
    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    if (existingSettings) {
      existingSettings.templateLanguage = language;
      await this.userSettingsRepository.save(existingSettings);
    } else {
      const newSettings = this.userSettingsRepository.create({
        userId,
        templateLanguage: language
      });
      await this.userSettingsRepository.save(newSettings);
    }
  }

  async getCompanyInfo(userId: string): Promise<Partial<UserSettings>> {
    const settings = await this.userSettingsRepository.findOne({
      where: { userId }
    });
    
    if (!settings) {
      return {
        companyName: '',
        companyAddress: '',
        companyEmail: '',
        companyPhone: '',
        companyTaxId: '',
        companyIban: '',
        companySwift: '',
        companyWebsite: '',
        companyTagline: '',
      };
    }

    return {
      companyName: settings.companyName || '',
      companyAddress: settings.companyAddress || '',
      companyEmail: settings.companyEmail || '',
      companyPhone: settings.companyPhone || '',
      companyTaxId: settings.companyTaxId || '',
      companyIban: settings.companyIban || '',
      companySwift: settings.companySwift || '',
      companyWebsite: settings.companyWebsite || '',
      companyTagline: settings.companyTagline || '',
    };
  }

  async updateCompanyInfo(userId: string, companyInfo: Partial<UserSettings>): Promise<void> {
    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId }
    });

    if (existingSettings) {
      if (companyInfo.companyName !== undefined) existingSettings.companyName = companyInfo.companyName;
      if (companyInfo.companyAddress !== undefined) existingSettings.companyAddress = companyInfo.companyAddress;
      if (companyInfo.companyEmail !== undefined) existingSettings.companyEmail = companyInfo.companyEmail;
      if (companyInfo.companyPhone !== undefined) existingSettings.companyPhone = companyInfo.companyPhone;
      if (companyInfo.companyTaxId !== undefined) existingSettings.companyTaxId = companyInfo.companyTaxId;
      if (companyInfo.companyIban !== undefined) existingSettings.companyIban = companyInfo.companyIban;
      if (companyInfo.companySwift !== undefined) existingSettings.companySwift = companyInfo.companySwift;
      if (companyInfo.companyWebsite !== undefined) existingSettings.companyWebsite = companyInfo.companyWebsite;
      if (companyInfo.companyTagline !== undefined) existingSettings.companyTagline = companyInfo.companyTagline;
      await this.userSettingsRepository.save(existingSettings);
    } else {
      const newSettings = this.userSettingsRepository.create({
        userId,
        ...companyInfo
      });
      await this.userSettingsRepository.save(newSettings);
    }
  }
}
