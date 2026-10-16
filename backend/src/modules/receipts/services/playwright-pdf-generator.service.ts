import { Injectable, Logger } from "@nestjs/common";
import { chromium, Browser } from "playwright";
import * as fs from "fs/promises";

@Injectable()
export class PlaywrightPdfGenerator {
  private readonly logger = new Logger(PlaywrightPdfGenerator.name);
  private browser: Browser | null = null;
  private initializing: Promise<void> | undefined;

  async initialize(): Promise<void> {
    if (this.browser?.isConnected()) return;
    if (!this.initializing) this.initializing = this.launchBrowser();
    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  private async launchBrowser(): Promise<void> {
    this.logger.log("Initializing Playwright browser...");
    this.browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      // The production container runs as root under Docker's default seccomp
      // profile, where Chromium's sandbox cannot start. Rendering is contained
      // instead by disabling JavaScript and blocking every non-data: request.
      chromiumSandbox: false,
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

  async generatePdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
    await this.initialize();

    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const context = await this.browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await context.route("**/*", (route) =>
      /^data:/i.test(route.request().url()) ? route.continue() : route.abort(),
    );

    try {
      const { width, height, contentBasedHeight, ...rest } = options;
      const margins = {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
        ...options.margin,
      };
      if (contentBasedHeight && width) {
        await page.setViewportSize({
          width: Math.ceil(
            this.toPixels(width) -
              this.toPixels(margins.left) -
              this.toPixels(margins.right),
          ),
          height: 800,
        });
      }
      // Set content and wait for it to load
      await page.setContent(html, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Emulate print media for consistent styling
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts.ready);

      // When width/height are provided, omit format (Playwright doesn't allow both)
      const measuredHeight = contentBasedHeight
        ? `${Math.ceil(await page.evaluate(() => document.body.getBoundingClientRect().height)) + this.toPixels(margins.top) + this.toPixels(margins.bottom) + 2}px`
        : height;
      const { format: requestedFormat, ...pdfRest } = rest;
      const baseOptions =
        width || measuredHeight
          ? { width, height: measuredHeight }
          : { format: requestedFormat || ("A4" as const) };

      // Generate PDF with optimized settings
      const pdfBuffer = await page.pdf({
        ...baseOptions,
        margin: margins,
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: false,
        ...pdfRest,
      });

      this.logger.log("PDF generated successfully");
      return pdfBuffer;
    } catch (error) {
      this.logger.error("Error generating PDF:", error);
      throw error;
    } finally {
      await context.close();
    }
  }

  private toPixels(length: string): number {
    const match = /^(\d+(?:\.\d+)?)(mm|cm|in|px)$/.exec(length);
    if (!match) throw new Error(`Unsupported PDF length: ${length}`);
    const factors: Record<string, number> = {
      mm: 96 / 25.4,
      cm: 96 / 2.54,
      in: 96,
      px: 1,
    };
    return Number(match[1]) * factors[match[2]];
  }

  async generatePdfFromFile(
    htmlFilePath: string,
    options: PdfOptions = {},
  ): Promise<Buffer> {
    const html = await fs.readFile(htmlFilePath, "utf-8");
    return this.generatePdf(html, options);
  }

  async cleanup(): Promise<void> {
    if (this.initializing) await this.initializing;
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
  width?: string;
  height?: string;
  contentBasedHeight?: boolean;
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
