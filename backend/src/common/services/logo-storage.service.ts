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
   * Note: S3 deleteObject is idempotent - it won't throw error if file doesn't exist
   */
  async deleteUserLogo(userId: string): Promise<void> {
    const key = this.getLogoKey(userId);

    // Validate bucket is configured
    if (!this.bucket) {
      const error = new Error(`LOGOS_BUCKET is not configured`);
      this.logger.error(error.message);
      throw error;
    }

    try {
      this.logger.log(
        `Attempting to delete logo for user ${userId}, key: ${key}, bucket: ${this.bucket}`,
      );

      // Directly delete - S3 deleteObject is idempotent and won't error if file doesn't exist
      await this.deleteFile(this.bucket, key);

      this.logger.log(
        `Logo deletion completed successfully for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete logo for user ${userId}: ${error.message}`,
      );
      this.logger.error(`Error details: ${JSON.stringify(error)}`);
      if ((error as any)?.code) {
        this.logger.error(`Error code: ${(error as any).code}`);
      }
      if ((error as any)?.statusCode) {
        this.logger.error(`Error status code: ${(error as any).statusCode}`);
      }
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
