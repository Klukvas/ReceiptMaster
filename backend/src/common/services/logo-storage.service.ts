import sharp = require("sharp");
import { ApiErrors } from "../errors/ApiError";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BaseObjectStorageService } from "./base-object-storage.service";

@Injectable()
export class LogoStorageService extends BaseObjectStorageService {
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    super(configService);
    this.s3.config.update({
      httpOptions: { timeout: 60000, connectTimeout: 10000 },
      maxRetries: 2,
    });
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

  async normalizeLogo(file: Buffer, declaredMime?: string): Promise<Buffer> {
    if (!file.length || file.length > 5 * 1024 * 1024) {
      throw ApiErrors.VALIDATION_ERROR(
        "logo",
        "Image must be between 1 byte and 5 MB",
      );
    }
    // Only raster output is ever stored or served. SVG is decoded from memory:
    // librsvg has no base file for local references and does not fetch network resources.
    try {
      const image = sharp(file, {
        limitInputPixels: 16_777_216,
        failOn: "warning",
        density: 72,
        pages: 1,
        animated: false,
      });
      const metadata = await image.metadata();
      if (metadata.format === "svg") {
        const source = file.toString("utf8");
        const unsafeCssUrl = [...source.matchAll(/url\(([^)]*)\)/gi)].some(
          (match) =>
            !match[1]
              .trim()
              .replace(/^["']|["']$/g, "")
              .startsWith("#"),
        );
        const unsafeReference = [
          ...source.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi),
        ].some((match) => !/^#[a-z0-9_.:-]+$/i.test(match[2]));
        if (
          source.includes("\0") ||
          !/<svg[\s>]/.test(source) ||
          (file[0] === 0x1f && file[1] === 0x8b) ||
          unsafeCssUrl ||
          unsafeReference ||
          /<!DOCTYPE|<!ENTITY|<\s*(?:[\w.-]+:)?(?:script|foreignObject|image)\b|\son[a-z]+\s*=|@import/i.test(
            source,
          )
        ) {
          throw new Error("SVG must contain only static local graphics");
        }
      }
      const formats = {
        png: "image/png",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
      };
      const mime = formats[metadata.format];
      const declared =
        declaredMime === "image/jpg" ? "image/jpeg" : declaredMime;
      if (
        !mime ||
        (declared && declared !== mime) ||
        !metadata.width ||
        !metadata.height ||
        metadata.width > 4096 ||
        metadata.height > 4096
      ) {
        throw new Error("Invalid image format or dimensions");
      }
      let png = await image
        .resize({
          width: 600,
          height: 600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .timeout({ seconds: 3 })
        .png()
        .toBuffer();
      // No accepted upload may exceed the read budget after JPEG/GIF expansion.
      if (png.length > 512 * 1024) {
        png = await sharp(png, { limitInputPixels: 16_777_216 })
          .resize({
            width: 300,
            height: 300,
            fit: "inside",
            withoutEnlargement: true,
          })
          .timeout({ seconds: 3 })
          .png()
          .toBuffer();
      }
      if (png.length > 512 * 1024)
        throw new Error("Normalized image exceeds 5 MB");
      return png;
    } catch {
      throw ApiErrors.VALIDATION_ERROR(
        "logo",
        "Use a valid PNG, JPEG, GIF or static SVG up to 4096 × 4096 pixels",
      );
    }
  }

  async uploadImmutable(
    png: Buffer,
    userId: string,
    assetId: string,
  ): Promise<string> {
    const key = `logos/${userId}/${assetId}.png`;
    await this.uploadFile(this.bucket, key, png, "image/png");
    return key;
  }

  async readImmutable(key: string, userId: string): Promise<Buffer> {
    if (
      !key.startsWith(`logos/${userId}/`) ||
      !/^logos\/[a-f0-9-]+\/[a-f0-9-]+\.png$/i.test(key)
    )
      throw new Error("Invalid logo key");
    return this.downloadFile(this.bucket, key);
  }

  async removeImmutable(key: string, userId: string): Promise<void> {
    if (!key.startsWith(`logos/${userId}/`))
      throw new Error("Invalid logo key");
    await this.deleteFile(this.bucket, key);
  }

  /**
   * Upload logo for specific user
   */
  async uploadLogo(
    file: Buffer,
    userId: string,
    mime?: string,
  ): Promise<string> {
    const key = this.getLogoKey(userId);

    const png = await this.normalizeLogo(file, mime);
    return this.uploadFile(this.bucket, key, png, "image/png");
  }

  /**
   * Download logo for specific user
   */
  async downloadLogo(userId: string): Promise<Buffer> {
    const key = this.getLogoKey(userId);

    try {
      return await this.normalizeLogo(
        await this.downloadFile(this.bucket, key),
      );
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
