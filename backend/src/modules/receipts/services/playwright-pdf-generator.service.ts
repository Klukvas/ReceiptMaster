import { Injectable, Logger } from "@nestjs/common";
import { chromium, Browser } from "playwright";
import * as fs from "fs/promises";

@Injectable()
export class PlaywrightPdfGenerator {
  private readonly logger = new Logger(PlaywrightPdfGenerator.name);
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.logger.log("Initializing Playwright browser...");
      this.browser = await chromium.launch({
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      });
      this.logger.log("Playwright browser initialized");
    }
  }

  async generatePdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
    await this.initialize();

    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const page = await this.browser.newPage();

    try {
      // Set content and wait for it to load
      await page.setContent(html, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Emulate print media for consistent styling
      await page.emulateMedia({ media: "print" });

      // Generate PDF with optimized settings
      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: {
          top: "20mm",
          bottom: "20mm",
          left: "15mm",
          right: "15mm",
        },
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: false,
        ...options,
      });

      this.logger.log("PDF generated successfully");
      return pdfBuffer;
    } catch (error) {
      this.logger.error("Error generating PDF:", error);
      throw error;
    } finally {
      await page.close();
    }
  }

  async generatePdfFromFile(
    htmlFilePath: string,
    options: PdfOptions = {},
  ): Promise<Buffer> {
    const html = await fs.readFile(htmlFilePath, "utf-8");
    return this.generatePdf(html, options);
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log("Playwright browser closed");
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.cleanup();
  }
}

export interface PdfOptions {
  format?: "A4" | "A3" | "A2" | "A1" | "A0" | "Letter" | "Legal" | "Tabloid";
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}
