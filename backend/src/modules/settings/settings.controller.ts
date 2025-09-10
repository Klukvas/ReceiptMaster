import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Res,
  HttpException,
  HttpStatus,
  Body,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs/promises";
import * as path from "path";
import { EnvConfig } from "../../config/env.schema";

@Controller("settings")
export class SettingsController {
  constructor(private configService: ConfigService<EnvConfig>) {}

  @Post("logo/upload")
  @UseInterceptors(
    FileInterceptor("logo", {
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|svg)$/)) {
          return callback(new Error("Only image files are allowed!"), false);
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException("No file uploaded", HttpStatus.BAD_REQUEST);
    }

    try {
      // Create assets directory if it doesn't exist
      const assetsPath = path.join(process.cwd(), "src", "assets");
      await fs.mkdir(assetsPath, { recursive: true });

      // Save the uploaded file as logo.png
      const logoPath = path.join(assetsPath, "logo.png");
      await fs.writeFile(logoPath, file.buffer);

      return {
        message: "Logo uploaded successfully",
        filename: "logo.png",
        originalName: file.originalname,
        size: file.size,
      };
    } catch (error) {
      throw new HttpException(
        "Failed to save logo",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("logo")
  async getLogo(@Res() res: Response) {
    try {
      const logoPath = path.join(process.cwd(), "src", "assets", "logo.png");

      // Check if logo exists
      try {
        await fs.access(logoPath);
      } catch {
        return res.status(404).json({ message: "Logo not found" });
      }

      const logoBuffer = await fs.readFile(logoPath);
      res.set({
        "Content-Type": "image/png",
        "Content-Length": logoBuffer.length.toString(),
      });
      res.send(logoBuffer);
    } catch (error) {
      throw new HttpException(
        "Failed to retrieve logo",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post("company-name")
  async updateCompanyName(@Body() body: { companyName: string }) {
    try {
      const settingsPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "settings.json",
      );
      const settings = {
        companyName: body.companyName || "", // Allow empty company name
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

      return {
        message: "Company name updated successfully",
        companyName: settings.companyName,
      };
    } catch (error) {
      throw new HttpException(
        "Failed to update company name",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("company-name")
  async getCompanyName() {
    try {
      const settingsPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "settings.json",
      );

      try {
        const settingsData = await fs.readFile(settingsPath, "utf-8");
        const settings = JSON.parse(settingsData);
        return {
          companyName: settings.companyName || "",
        };
      } catch {
        // If settings file doesn't exist, return empty string
        return {
          companyName: "",
        };
      }
    } catch (error) {
      throw new HttpException(
        "Failed to retrieve company name",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post("logo/delete")
  async deleteLogo() {
    try {
      const logoPath = path.join(process.cwd(), "src", "assets", "logo.png");

      try {
        await fs.unlink(logoPath);
        return {
          message: "Logo deleted successfully",
        };
      } catch (error) {
        if (error.code === "ENOENT") {
          return {
            message: "Logo not found",
          };
        }
        throw error;
      }
    } catch (error) {
      throw new HttpException(
        "Failed to delete logo",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
