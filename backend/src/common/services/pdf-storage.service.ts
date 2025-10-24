import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BaseObjectStorageService } from "./base-object-storage.service";
import { ApiErrors } from "../errors/ApiError";

@Injectable()
export class PdfStorageService extends BaseObjectStorageService {
  constructor(configService: ConfigService) {
    super(configService);
  }

  /**
   * Get bucket for specific folder
   */
  protected getBucketForFolder(folder: string): string | null {
    switch (folder) {
      case "receipts":
        return this.configService.get("RECEIPTS_BUCKET");
      case "temp":
        return this.configService.get("TEMP_BUCKET");
      default:
        return null;
    }
  }

  /**
   * Upload PDF receipt for specific user
   */
  async uploadReceipt(
    file: Buffer,
    filename: string,
    userId: string,
  ): Promise<string> {
    const bucket = this.configService.get("RECEIPTS_BUCKET");
    const key = `receipts/${userId}/${filename}`;

    return this.uploadFile(bucket, key, file, "application/pdf");
  }

  /**
   * Download PDF receipt for specific user
   */
  async downloadReceipt(filename: string, userId: string): Promise<Buffer> {
    const bucket = this.configService.get("RECEIPTS_BUCKET");
    const key = `receipts/${userId}/${filename}`;

    try {
      return await this.downloadFile(bucket, key);
    } catch (error) {
      this.logger.error(
        `Failed to download receipt ${filename} for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Check if receipt exists for specific user
   */
  async receiptExists(filename: string, userId: string): Promise<boolean> {
    const bucket = this.configService.get("RECEIPTS_BUCKET");
    const key = `receipts/${userId}/${filename}`;

    try {
      return await this.fileExists(bucket, key);
    } catch (error) {
      this.logger.error(
        `Failed to check receipt existence ${filename} for user ${userId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Delete PDF receipt for specific user
   */
  async deleteReceipt(filename: string, userId: string): Promise<void> {
    const bucket = this.configService.get("RECEIPTS_BUCKET");
    const key = `receipts/${userId}/${filename}`;

    try {
      await this.deleteFile(bucket, key);
      this.logger.log(`Receipt deleted: ${filename} for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete receipt ${filename} for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get receipt URL for specific user
   */
  getReceiptUrl(filename: string, userId: string): string {
    const bucket = this.configService.get("RECEIPTS_BUCKET");
    const key = `receipts/${userId}/${filename}`;
    return `${this.configService.get("S3_ENDPOINT")}/${bucket}/${key}`;
  }

  /**
   * Upload temporary PDF file
   */
  async uploadTempFile(file: Buffer, filename: string): Promise<string> {
    const bucket = this.configService.get("TEMP_BUCKET");
    const key = `temp/${filename}`;

    return this.uploadFile(bucket, key, file, "application/pdf");
  }

  /**
   * Download temporary PDF file
   */
  async downloadTempFile(filename: string): Promise<Buffer> {
    const bucket = this.configService.get("TEMP_BUCKET");
    const key = `temp/${filename}`;

    try {
      return await this.downloadFile(bucket, key);
    } catch (error) {
      this.logger.error(
        `Failed to download temp file ${filename}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete temporary PDF file
   */
  async deleteTempFile(filename: string): Promise<void> {
    const bucket = this.configService.get("TEMP_BUCKET");
    const key = `temp/${filename}`;

    try {
      await this.deleteFile(bucket, key);
      this.logger.log(`Temp file deleted: ${filename}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete temp file ${filename}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Parse object storage path and download file
   */
  async downloadFileByPath(objectStoragePath: string): Promise<Buffer> {
    const fileInfo = this.parseObjectStoragePath(objectStoragePath);
    if (!fileInfo) {
      throw ApiErrors.VALIDATION_ERROR(
        "path",
        `Invalid object storage path: ${objectStoragePath}`,
      );
    }

    return this.downloadFile(fileInfo.bucket, fileInfo.key);
  }

  /**
   * Parse object storage path and delete file
   */
  async deleteFileByPath(objectStoragePath: string): Promise<void> {
    const fileInfo = this.parseObjectStoragePath(objectStoragePath);
    if (!fileInfo) {
      throw ApiErrors.VALIDATION_ERROR(
        "path",
        `Invalid object storage path: ${objectStoragePath}`,
      );
    }

    await this.deleteFile(fileInfo.bucket, fileInfo.key);
  }

  /**
   * Parse object storage path and check if file exists
   */
  async fileExistsByPath(objectStoragePath: string): Promise<boolean> {
    const fileInfo = this.parseObjectStoragePath(objectStoragePath);
    if (!fileInfo) {
      return false;
    }

    return this.fileExists(fileInfo.bucket, fileInfo.key);
  }
}
