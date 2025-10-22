import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { EnvConfig } from '../../config/env.schema';

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly s3: AWS.S3;

  constructor(private configService: ConfigService<EnvConfig>) {
    // Настройка S3 клиента для Hetzner Object Storage
    // Используем AWS-совместимые переменные (стандарт для S3-совместимых сервисов)
    this.s3 = new AWS.S3({
      endpoint: this.configService.get('S3_ENDPOINT'),
      region: this.configService.get('AWS_REGION'),
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      s3ForcePathStyle: true, // Important for Hetzner Object Storage
      signatureVersion: 'v4',
    });
  }

  /**
   * Upload file to Object Storage
   */
  async uploadFile(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      const params = {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'private',
      };

      const result = await this.s3.upload(params).promise();
      this.logger.log(`File uploaded successfully: ${result.Location}`);
      
      return result.Location;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload logo
   */
  async uploadLogo(file: Buffer, filename: string): Promise<string> {
    const bucket = this.configService.get('LOGOS_BUCKET');
    const key = `logos/${filename}`;
    
    return this.uploadFile(bucket, key, file, 'image/png');
  }

  /**
   * Upload PDF receipt
   */
  async uploadReceipt(file: Buffer, filename: string): Promise<string> {
    const bucket = this.configService.get('RECEIPTS_BUCKET');
    const key = `receipts/${filename}`;
    
    return this.uploadFile(bucket, key, file, 'application/pdf');
  }

  /**
   * Get file URL
   */
  async getFileUrl(bucket: string, key: string): Promise<string> {
    try {
      const params = {
        Bucket: bucket,
        Key: key,
        Expires: 3600, // URL valid for 1 hour
      };

      const url = this.s3.getSignedUrl('getObject', params);
      return url;
    } catch (error) {
      this.logger.error(`Failed to get file URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get logo URL
   */
  async getLogoUrl(filename: string): Promise<string> {
    const bucket = this.configService.get('LOGOS_BUCKET');
    const key = `logos/${filename}`;
    
    return this.getFileUrl(bucket, key);
  }

  /**
   * Get PDF receipt URL
   */
  async getReceiptUrl(filename: string): Promise<string> {
    const bucket = this.configService.get('RECEIPTS_BUCKET');
    const key = `receipts/${filename}`;
    
    return this.getFileUrl(bucket, key);
  }

  /**
   * Delete file
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    try {
      const params = {
        Bucket: bucket,
        Key: key,
      };

      await this.s3.deleteObject(params).promise();
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      const params = {
        Bucket: bucket,
        Key: key,
      };

      await this.s3.headObject(params).promise();
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Download file from Object Storage
   */
  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    try {
      const params = {
        Bucket: bucket,
        Key: key,
      };

      const result = await this.s3.getObject(params).promise();
      return result.Body as Buffer;
    } catch (error) {
      this.logger.error(`Failed to download file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download receipt PDF
   */
  async downloadReceipt(filename: string): Promise<Buffer> {
    const bucket = this.configService.get('RECEIPTS_BUCKET');
    const key = `receipts/${filename}`;
    
    return this.downloadFile(bucket, key);
  }

  /**
   * Parse object storage path to get bucket and key
   */
  parseObjectStoragePath(objectStoragePath: string): { bucket: string; key: string } | null {
    // Parse paths like "object-storage://receipts/filename.pdf"
    const match = objectStoragePath.match(/^object-storage:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      return null;
    }

    const [, folder, filename] = match;
    const bucket = folder === 'receipts' ? this.configService.get('RECEIPTS_BUCKET') : 
                   folder === 'logos' ? this.configService.get('LOGOS_BUCKET') : 
                   folder === 'temp' ? this.configService.get('TEMP_BUCKET') : null;
    
    if (!bucket) {
      return null;
    }

    return {
      bucket,
      key: `${folder}/${filename}`
    };
  }

  /**
   * Create folders in Object Storage
   */
  async createFolders(): Promise<void> {
    const buckets = [
      this.configService.get('LOGOS_BUCKET'),
      this.configService.get('RECEIPTS_BUCKET'),
      this.configService.get('TEMP_BUCKET'),
    ];

    for (const bucket of buckets) {
      if (bucket) {
        try {
          // Create "folders" by uploading empty objects
          const folders = ['logos/', 'receipts/', 'temp/'];
          
          for (const folder of folders) {
            const params = {
              Bucket: bucket,
              Key: folder,
              Body: '',
            };

            await this.s3.putObject(params).promise();
          }
          
          this.logger.log(`Folders created in bucket: ${bucket}`);
        } catch (error) {
          this.logger.error(`Failed to create folders in bucket ${bucket}: ${error.message}`);
        }
      }
    }
  }
}
