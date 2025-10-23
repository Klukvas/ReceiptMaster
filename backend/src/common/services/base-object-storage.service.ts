import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

export interface FileUploadResult {
  url: string;
  key: string;
  bucket: string;
}

export interface FileInfo {
  bucket: string;
  key: string;
}

@Injectable()
export abstract class BaseObjectStorageService {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly s3: AWS.S3;

  constructor(protected readonly configService: ConfigService) {
    this.s3 = new AWS.S3({
      endpoint: this.configService.get('S3_ENDPOINT'),
      region: this.configService.get('AWS_REGION'),
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
    });
  }

  /**
   * Upload file to Object Storage
   */
  async uploadFile(
    bucket: string,
    key: string,
    file: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      const params = {
        Bucket: bucket,
        Key: key,
        Body: file,
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
   * Delete file from Object Storage
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
   * Check if file exists in Object Storage
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
      this.logger.error(`Failed to check file existence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse object storage path to extract bucket and key
   */
  parseObjectStoragePath(objectStoragePath: string): FileInfo | null {
    const match = objectStoragePath.match(/^object-storage:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      return null;
    }

    const [, folder, path] = match;
    
    // Determine bucket based on folder
    const bucket = this.getBucketForFolder(folder);
    if (!bucket) {
      return null;
    }

    return {
      bucket,
      key: `${folder}/${path}`
    };
  }

  /**
   * Abstract method to get bucket for specific folder
   */
  protected abstract getBucketForFolder(folder: string): string | null;
}
