import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BaseObjectStorageService } from "./base-object-storage.service";

@Injectable()
export class LogoStorageService extends BaseObjectStorageService {
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    super(configService);
    this.bucket = configService.get("LOGOS_BUCKET");
  }

  /**
   * Get bucket for specific folder
   */
  protected getBucketForFolder(folder: string): string | null {
    return folder === "logos" ? this.configService.get("LOGOS_BUCKET") : null;
  }

  /**
   * Generate logo key for specific user
   */
  private getLogoKey(userId: string): string {
    return `logos/logo-${userId}.png`;
  }

  /**
   * Upload logo for specific user
   */
  async uploadLogo(file: Buffer, userId: string): Promise<string> {
    const key = this.getLogoKey(userId);

    return this.uploadFile(this.bucket, key, file, "image/png");
  }

  /**
   * Download logo for specific user
   */
  async downloadLogo(userId: string): Promise<Buffer> {
    const key = this.getLogoKey(userId);

    try {
      return await this.downloadFile(this.bucket, key);
    } catch (error) {
      this.logger.error(
        `Failed to download logo for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Check if user has logo
   */
  async userHasLogo(userId: string): Promise<boolean> {
    const key = this.getLogoKey(userId);

    try {
      return await this.fileExists(this.bucket, key);
    } catch (error) {
      this.logger.error(
        `Failed to check logo existence for user ${userId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Delete logo for specific user
   */
  async deleteUserLogo(userId: string): Promise<void> {
    const key = this.getLogoKey(userId);

    try {
      await this.deleteFile(this.bucket, key);
      this.logger.log(`Logo deleted for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete logo for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get logo URL for specific user
   */
  getLogoUrl(userId: string): string {
    const key = this.getLogoKey(userId);
    return `${this.configService.get("S3_ENDPOINT")}/${this.bucket}/${key}`;
  }
}
