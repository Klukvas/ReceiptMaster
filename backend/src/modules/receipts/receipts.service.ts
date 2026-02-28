import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import {
  PdfGeneratorService,
  ReceiptStyle,
} from "./services/pdf-generator.service";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { User } from "../users/entities/user.entity";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { ConfigService } from "@nestjs/config";
import { SettingsService } from "../settings/services/settings.service";
import {
  RECEIPT_GENERATION_QUEUE,
  ReceiptGenerationJobData,
} from "./receipt-generation.processor";

const execFileAsync = promisify(execFile);

/** Only allow alphanumeric, hyphens, underscores, dots, and spaces in printer names */
const SAFE_PRINTER_NAME = /^[a-zA-Z0-9_\-. ]+$/;

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly MAX_RECEIPTS = 10;
  private receiptFunctionEnsuredPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private pdfGeneratorService: PdfGeneratorService,
    private pdfStorageService: PdfStorageService,
    @InjectDataSource()
    private dataSource: DataSource,
    private configService: ConfigService,
    private settingsService: SettingsService,
    @InjectQueue(RECEIPT_GENERATION_QUEUE)
    private receiptQueue: Queue<ReceiptGenerationJobData>,
  ) {}

  private getReceiptStyleFromTemplateId(templateId: string): ReceiptStyle {
    switch (templateId) {
      case "standard":
        return ReceiptStyle.STANDARD;
      case "compact":
        return ReceiptStyle.COMPACT;
      case "classic":
        return ReceiptStyle.CLASSIC;
      case "modern":
        return ReceiptStyle.MODERN;
      case "elegant":
        return ReceiptStyle.ELEGANT;
      case "vintage":
        return ReceiptStyle.VINTAGE;
      case "tech":
        return ReceiptStyle.TECH;
      case "wave":
        return ReceiptStyle.WAVE;
      case "minimal":
        return ReceiptStyle.MINIMAL;
      case "corporate":
        return ReceiptStyle.CORPORATE;
      default:
        this.logger.warn(
          `Unknown template ID: ${templateId}, falling back to COMPACT`,
        );
        return ReceiptStyle.COMPACT;
    }
  }

  async generateReceipt(orderId: string, user: User): Promise<Receipt> {
    let s3PathsToDelete: Array<{ bucket: string; key: string }> = [];

    const savedReceipt = await this.dataSource.transaction(async (manager) => {
      // Проверяем существование заказа и принадлежность пользователю
      const order = await manager.findOne(Order, {
        where: { id: orderId, user_id: user.id },
        relations: ["recipient", "items"],
      });
      if (!order) {
        throw ApiErrors.ORDER_NOT_FOUND(orderId);
      }

      // Проверяем статус заказа
      if (order.status !== OrderStatus.CONFIRMED) {
        throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(orderId);
      }

      // Проверяем, что чек еще не создан (generated or already processing)
      const existingReceipt = await manager.findOne(Receipt, {
        where: [
          { order_id: orderId, status: ReceiptStatus.GENERATED },
          { order_id: orderId, status: ReceiptStatus.PROCESSING },
        ],
      });
      if (existingReceipt) {
        if (existingReceipt.status === ReceiptStatus.PROCESSING) {
          // Already being generated, return the in-progress receipt
          return existingReceipt;
        }
        throw ApiErrors.RECEIPT_ALREADY_EXISTS(orderId);
      }

      // Очищаем старые чеки перед созданием нового (S3 paths collected, not deleted yet)
      s3PathsToDelete = await this.cleanupOldReceipts(manager, user.id);

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Create receipt record with PROCESSING status
      const receipt = manager.create(Receipt, {
        order_id: orderId,
        number: receiptNumber,
        status: ReceiptStatus.PROCESSING,
        user_id: user.id,
      });

      const result = await manager.save(Receipt, receipt);

      // Enqueue background PDF generation job
      await this.receiptQueue.add(
        "generate",
        {
          receiptId: result.id,
          orderId,
          userId: user.id,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );

      this.logger.log(
        `Receipt ${receiptNumber} queued for generation (order ${orderId})`,
      );

      return result;
    });

    // Delete S3 files outside the transaction to avoid holding locks during I/O
    this.deleteS3FilesInBackground(s3PathsToDelete);

    return savedReceipt;
  }

  async generateCompactReceipt(orderId: string, user: User): Promise<Receipt> {
    // Delegates to generateReceipt — template style is determined by user settings
    return this.generateReceipt(orderId, user);
  }

  async generateStandardReceipt(orderId: string, user: User): Promise<Receipt> {
    // Delegates to generateReceipt — template style is determined by user settings
    return this.generateReceipt(orderId, user);
  }

  async generateTestReceipt(user: User): Promise<Buffer> {
    const pdfSettings = await this.settingsService.getAllPdfSettings(user.id);
    const receiptStyle = this.getReceiptStyleFromTemplateId(
      pdfSettings.templateId,
    );

    const mockOrder = {
      id: "00000000-0000-0000-0000-000000000000",
      recipient_id: "00000000-0000-0000-0000-000000000000",
      status: OrderStatus.CONFIRMED,
      subtotal_cents: 2050000,
      total_cents: 2050000,
      currency: "UAH",
      created_by: "test",
      user_id: user.id,
      created_at: new Date(),
      updated_at: new Date(),
      is_locked: false,
      payment_status: "unpaid" as any,
      user: user,
      recipient: {
        id: "00000000-0000-0000-0000-000000000000",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "+380501234567",
        address: "123 Main St, Kyiv, 01001",
        user_id: user.id,
      } as any,
      items: [
        {
          id: "i1",
          order_id: "00000000-0000-0000-0000-000000000000",
          product_id: "p1",
          product_name: "Website Development",
          unit_price_cents: 1500000,
          qty: 1,
          line_total_cents: 1500000,
          user_id: user.id,
        },
        {
          id: "i2",
          order_id: "00000000-0000-0000-0000-000000000000",
          product_id: "p2",
          product_name: "Logo Design",
          unit_price_cents: 350000,
          qty: 1,
          line_total_cents: 350000,
          user_id: user.id,
        },
        {
          id: "i3",
          order_id: "00000000-0000-0000-0000-000000000000",
          product_id: "p3",
          product_name: "Technical Support",
          unit_price_cents: 200000,
          qty: 1,
          line_total_cents: 200000,
          user_id: user.id,
        },
      ] as any,
      receipts: [] as any,
    } as Order;

    const { filePath } = await this.pdfGeneratorService.generateReceiptPdf(
      mockOrder,
      "TEST-000001",
      pdfSettings.companyInfo,
      user.id,
      receiptStyle,
      pdfSettings.receiptTitle,
      pdfSettings.templateLanguage,
      pdfSettings.footerTitle,
      pdfSettings.footerSubtitle,
    );

    let pdfBuffer: Buffer;
    if (filePath.startsWith("object-storage://")) {
      const parsed = this.pdfStorageService.parseObjectStoragePath(filePath);
      if (!parsed) {
        throw ApiErrors.VALIDATION_ERROR(
          "pdf_path",
          `Invalid path: ${filePath}`,
        );
      }
      pdfBuffer = await this.pdfStorageService.downloadFile(
        parsed.bucket,
        parsed.key,
      );
      try {
        await this.pdfStorageService.deleteFile(parsed.bucket, parsed.key);
      } catch {
        /* cleanup */
      }
    } else {
      pdfBuffer = await fs.readFile(filePath);
      try {
        await fs.unlink(filePath);
      } catch {
        /* cleanup */
      }
    }

    return pdfBuffer;
  }

  async voidReceipt(id: string, user: User, reason: string): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      const receipt = await manager.findOne(Receipt, {
        where: { id, user_id: user.id },
        relations: ["order"],
      });

      if (!receipt) {
        throw ApiErrors.RECEIPT_NOT_FOUND(id);
      }

      if (receipt.status === ReceiptStatus.VOID) {
        throw ApiErrors.BAD_REQUEST(`Receipt ${id} is already voided`);
      }

      // Void the receipt (immutable update)
      const savedReceipt = await manager.save(Receipt, {
        ...receipt,
        status: ReceiptStatus.VOID,
        voided_at: new Date(),
        void_reason: reason,
      });

      // Unlock the order so it can be modified again
      await manager.update(
        Order,
        { id: receipt.order_id },
        { is_locked: false },
      );

      this.logger.log(
        `Receipt ${receipt.number} voided. Order ${receipt.order_id} unlocked.`,
      );

      return savedReceipt;
    });
  }

  async findAll(
    user: User,
    options?: { offset?: number; limit?: number },
  ): Promise<{
    data: Receipt[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const offset = options?.offset ?? 0;
    const limit = Math.min(options?.limit ?? 20, 100);

    const [data, total] = await this.receiptsRepository.findAndCount({
      where: { user_id: user.id },
      relations: ["order", "order.recipient"],
      order: { created_at: "DESC" },
      skip: offset,
      take: limit,
    });

    return { data, total, offset, limit };
  }

  async findOne(id: string, user: User): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id, user_id: user.id },
      relations: ["order", "order.recipient", "order.items"],
    });
    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(id);
    }
    return receipt;
  }

  async getReceiptPdf(
    id: string,
    user: User,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.findOne(id, user);

    if (!receipt.pdf_path) {
      throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
    }

    try {
      let buffer: Buffer;

      // Check if it's an object storage path
      if (receipt.pdf_path.startsWith("object-storage://")) {
        const parsed = this.pdfStorageService.parseObjectStoragePath(
          receipt.pdf_path,
        );
        if (!parsed) {
          throw ApiErrors.VALIDATION_ERROR(
            "pdf_path",
            `Invalid object storage path: ${receipt.pdf_path}`,
          );
        }

        // Check if file exists in object storage
        const exists = await this.pdfStorageService.fileExists(
          parsed.bucket,
          parsed.key,
        );
        if (!exists) {
          throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
        }

        buffer = await this.pdfStorageService.downloadFile(
          parsed.bucket,
          parsed.key,
        );
      } else {
        // Local file system path
        await fs.access(receipt.pdf_path);
        buffer = await fs.readFile(receipt.pdf_path);
      }

      const filename = `receipt-${receipt.number}.pdf`;
      return { buffer, filename };
    } catch (error) {
      // Если файл не найден, пытаемся регенерировать его
      this.logger.log(
        `PDF файл не найден: ${receipt.pdf_path}, пытаемся регенерировать...`,
      );

      try {
        // Получаем заказ для регенерации
        const order = await this.ordersRepository.findOne({
          where: { id: receipt.order_id },
          relations: ["recipient", "items"],
        });

        if (!order) {
          throw ApiErrors.ORDER_NOT_FOUND(receipt.order_id);
        }

        // Регенерируем PDF с использованием всех настроек пользователя
        const pdfSettings = await this.settingsService.getAllPdfSettings(
          user.id,
        );
        const receiptStyle = this.getReceiptStyleFromTemplateId(
          pdfSettings.templateId,
        );

        const { filePath, url } =
          await this.pdfGeneratorService.generateReceiptPdf(
            order,
            receipt.number,
            pdfSettings.companyInfo,
            user.id,
            receiptStyle,
            pdfSettings.receiptTitle,
            pdfSettings.templateLanguage,
            pdfSettings.footerTitle,
            pdfSettings.footerSubtitle,
          );

        // Обновляем путь к файлу в базе данных (immutable update)
        await this.receiptsRepository.save({
          ...receipt,
          pdf_path: filePath,
          pdf_url: url,
        });

        // Читаем новый файл
        let buffer: Buffer;
        if (filePath.startsWith("object-storage://")) {
          const parsed =
            this.pdfStorageService.parseObjectStoragePath(filePath);
          if (!parsed) {
            throw ApiErrors.VALIDATION_ERROR(
              "pdf_path",
              `Invalid object storage path: ${filePath}`,
            );
          }
          buffer = await this.pdfStorageService.downloadFile(
            parsed.bucket,
            parsed.key,
          );
        } else {
          buffer = await fs.readFile(filePath);
        }

        const filename = `receipt-${receipt.number}.pdf`;

        this.logger.log(`PDF успешно регенерирован: ${filePath}`);
        return { buffer, filename };
      } catch (regenerateError) {
        this.logger.error("Ошибка при регенерации PDF:", regenerateError);
        throw ApiErrors.RECEIPT_GENERATION_FAILED(receipt.order_id);
      }
    }
  }

  async regenerateReceiptPdf(id: string, user: User): Promise<Receipt> {
    const receipt = await this.findOne(id, user);

    // Получаем заказ для регенерации
    const order = await this.ordersRepository.findOne({
      where: { id: receipt.order_id },
      relations: ["recipient", "items"],
    });

    if (!order) {
      throw ApiErrors.ORDER_NOT_FOUND(receipt.order_id);
    }

    // Удаляем старый файл, если он существует
    if (receipt.pdf_path) {
      try {
        if (receipt.pdf_path.startsWith("object-storage://")) {
          const parsed = this.pdfStorageService.parseObjectStoragePath(
            receipt.pdf_path,
          );
          if (parsed) {
            await this.pdfStorageService.deleteFile(parsed.bucket, parsed.key);
            this.logger.log(
              `Старый PDF файл удален из object storage: ${receipt.pdf_path}`,
            );
          }
        } else {
          await fs.unlink(receipt.pdf_path);
          this.logger.log(`Старый PDF файл удален: ${receipt.pdf_path}`);
        }
      } catch (error) {
        this.logger.warn(
          `Не удалось удалить старый PDF файл: ${error.message}`,
        );
      }
    }

    // Регенерируем PDF с использованием всех настроек пользователя
    const pdfSettings = await this.settingsService.getAllPdfSettings(user.id);
    const receiptStyle = this.getReceiptStyleFromTemplateId(
      pdfSettings.templateId,
    );

    const { filePath, url } = await this.pdfGeneratorService.generateReceiptPdf(
      order,
      receipt.number,
      pdfSettings.companyInfo,
      user.id,
      receiptStyle,
      pdfSettings.receiptTitle,
      pdfSettings.templateLanguage,
      pdfSettings.footerTitle,
      pdfSettings.footerSubtitle,
    );

    // Вычисляем хеш нового файла
    let fileBuffer: Buffer;
    if (filePath.startsWith("object-storage://")) {
      const parsed = this.pdfStorageService.parseObjectStoragePath(filePath);
      if (!parsed) {
        throw ApiErrors.VALIDATION_ERROR(
          "pdf_path",
          `Invalid object storage path: ${filePath}`,
        );
      }
      fileBuffer = await this.pdfStorageService.downloadFile(
        parsed.bucket,
        parsed.key,
      );
    } else {
      fileBuffer = await fs.readFile(filePath);
    }
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Обновляем запись о чеке (immutable update)
    const updatedReceipt = await this.receiptsRepository.save({
      ...receipt,
      pdf_path: filePath,
      pdf_url: url,
      hash,
    });
    this.logger.log(`PDF успешно регенерирован: ${filePath}`);

    return updatedReceipt;
  }

  private async generateReceiptNumber(): Promise<string> {
    try {
      // Сначала проверяем, существует ли функция, и создаем её если нет
      await this.ensureReceiptNumberFunction();

      // Используем функцию PostgreSQL для генерации номера чека
      const _result = await this.dataSource.query(
        "SELECT generate_receipt_number() as receipt_number",
      );
      return _result[0].receipt_number;
    } catch (error) {
      this.logger.error("Error generating receipt number:", error);
      // Fallback: генерируем номер вручную
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-6);
      return `${year}-${timestamp}`;
    }
  }

  private async ensureReceiptNumberFunction(): Promise<void> {
    if (!this.receiptFunctionEnsuredPromise) {
      this.receiptFunctionEnsuredPromise =
        this.doEnsureReceiptNumberFunction().catch((error) => {
          // Reset so next call retries
          this.receiptFunctionEnsuredPromise = null;
          throw error;
        });
    }
    return this.receiptFunctionEnsuredPromise;
  }

  private async doEnsureReceiptNumberFunction(): Promise<void> {
    const checkResult = await this.dataSource.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'generate_receipt_number'
      ) as exists
    `);

    if (!checkResult[0].exists) {
      await this.dataSource.query(`
        CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1
      `);

      await this.dataSource.query(`
        CREATE OR REPLACE FUNCTION generate_receipt_number()
        RETURNS TEXT AS $$
        DECLARE
            year_part TEXT;
            seq_part TEXT;
        BEGIN
            year_part := EXTRACT(YEAR FROM NOW())::TEXT;
            seq_part := LPAD(nextval('receipt_number_seq')::TEXT, 6, '0');
            RETURN year_part || '-' || seq_part;
        END;
        $$ LANGUAGE plpgsql
      `);
    }
  }

  /**
   * Collects old receipts for cleanup within a transaction.
   * Returns S3 paths to delete AFTER the transaction commits.
   */
  private async cleanupOldReceipts(
    manager: any,
    userId: string,
  ): Promise<Array<{ bucket: string; key: string }>> {
    const s3PathsToDelete: Array<{ bucket: string; key: string }> = [];

    try {
      // Count only this user's generated receipts
      const totalReceipts = await manager.count(Receipt, {
        where: { status: ReceiptStatus.GENERATED, user_id: userId },
      });

      if (totalReceipts >= this.MAX_RECEIPTS) {
        // Get oldest receipts for this user only
        const oldReceipts = await manager.find(Receipt, {
          where: { status: ReceiptStatus.GENERATED, user_id: userId },
          order: { created_at: "ASC" },
          take: totalReceipts - (this.MAX_RECEIPTS - 1),
        });

        // Collect S3 paths for deletion after transaction
        for (const receipt of oldReceipts) {
          if (
            receipt.pdf_path &&
            receipt.pdf_path.startsWith("object-storage://")
          ) {
            const parsed = this.pdfStorageService.parseObjectStoragePath(
              receipt.pdf_path,
            );
            if (parsed) {
              s3PathsToDelete.push(parsed);
            }
          }
        }

        // Delete DB records inside the transaction
        if (oldReceipts.length > 0) {
          const receiptIds = oldReceipts.map((receipt: Receipt) => receipt.id);
          await manager.delete(Receipt, receiptIds);
          this.logger.log(
            `Cleaned up ${oldReceipts.length} old receipts for user ${userId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error("Error cleaning up old receipts:", error);
      // Don't block receipt creation due to cleanup errors
    }

    return s3PathsToDelete;
  }

  /**
   * Deletes S3 files in background (fire-and-forget after transaction commit).
   */
  private deleteS3FilesInBackground(
    paths: Array<{ bucket: string; key: string }>,
  ): void {
    if (paths.length === 0) return;

    Promise.allSettled(
      paths.map((p) => this.pdfStorageService.deleteFile(p.bucket, p.key)),
    ).then((results) => {
      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (failed.length > 0) {
        this.logger.warn(
          `Failed to delete ${failed.length}/${paths.length} old receipt files from S3: ${failed.map((f) => f.reason?.message ?? f.reason).join(", ")}`,
        );
      }
    });
  }

  async getAvailablePrinters(): Promise<{ printers: string[] }> {
    try {
      const platform = process.platform;
      let stdout: string;

      if (platform === "darwin" || platform === "linux") {
        const result = await execFileAsync("lpstat", ["-p"]);
        stdout = result.stdout;
        // Parse "printer <name> ..." lines
        const printers = stdout
          .split("\n")
          .filter((line) => line.includes("printer"))
          .map((line) => line.split(/\s+/)[1])
          .filter((name) => name && name.length > 0);
        return { printers };
      } else if (platform === "win32") {
        const result = await execFileAsync("powershell", [
          "-Command",
          "Get-Printer | Select-Object -ExpandProperty Name",
        ]);
        stdout = result.stdout;
        const printers = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        return { printers };
      }

      return { printers: [] };
    } catch (error) {
      this.logger.error("Error getting printers:", error);
      return { printers: [] };
    }
  }

  async printReceipt(
    receiptId: string,
    user: User,
    printerName?: string,
  ): Promise<{ success: boolean; message: string }> {
    let tempFilePath: string | null = null;

    try {
      const receipt = await this.findOne(receiptId, user);

      if (!receipt.pdf_path) {
        throw ApiErrors.FILE_NOT_FOUND(receiptId);
      }

      // Проверяем существование файла
      try {
        if (receipt.pdf_path.startsWith("object-storage://")) {
          const parsed = this.pdfStorageService.parseObjectStoragePath(
            receipt.pdf_path,
          );
          if (!parsed) {
            throw ApiErrors.VALIDATION_ERROR(
              "pdf_path",
              `Invalid object storage path: ${receipt.pdf_path}`,
            );
          }
          const exists = await this.pdfStorageService.fileExists(
            parsed.bucket,
            parsed.key,
          );
          if (!exists) {
            throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
          }
        } else {
          await fs.access(receipt.pdf_path);
        }
      } catch {
        throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
      }

      let filePathToPrint = receipt.pdf_path;

      if (receipt.pdf_path.startsWith("object-storage://")) {
        const parsed = this.pdfStorageService.parseObjectStoragePath(
          receipt.pdf_path,
        );
        if (!parsed) {
          throw ApiErrors.VALIDATION_ERROR(
            "pdf_path",
            `Invalid object storage path: ${receipt.pdf_path}`,
          );
        }

        const fileBuffer = await this.pdfStorageService.downloadFile(
          parsed.bucket,
          parsed.key,
        );
        tempFilePath = path.join(
          process.cwd(),
          "temp",
          `receipt-${receipt.number}-${Date.now()}.pdf`,
        );

        await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
        await fs.writeFile(tempFilePath, fileBuffer);
        filePathToPrint = tempFilePath;
      }

      // Validate printer name to prevent injection
      if (printerName && !SAFE_PRINTER_NAME.test(printerName)) {
        throw ApiErrors.VALIDATION_ERROR(
          "printer",
          "Invalid printer name. Only alphanumeric characters, hyphens, underscores, dots, and spaces are allowed.",
        );
      }

      const platform = process.platform;
      let cmd: string;
      let args: string[];

      if (platform === "darwin") {
        cmd = "lpr";
        args = printerName
          ? ["-P", printerName, filePathToPrint]
          : [filePathToPrint];
      } else if (platform === "linux") {
        cmd = "lp";
        args = printerName
          ? ["-d", printerName, filePathToPrint]
          : [filePathToPrint];
      } else if (platform === "win32") {
        cmd = "powershell";
        args = [
          "-Command",
          `Start-Process -FilePath '${filePathToPrint.replace(/'/g, "''")}' -Verb Print -WindowStyle Hidden`,
        ];
      } else {
        throw ApiErrors.BAD_REQUEST(
          `Unsupported operating system: ${platform}`,
        );
      }

      this.logger.log(
        `Printing receipt ${receipt.number} via ${cmd} ${args.join(" ")}`,
      );
      const { stderr } = await execFileAsync(cmd, args);

      if (stderr && !stderr.includes("warning")) {
        this.logger.error("Print command stderr:", stderr);
        throw ApiErrors.RECEIPT_PRINT_FAILED(receiptId);
      }

      this.logger.log(`Receipt ${receipt.number} sent to printer successfully`);
      return {
        success: true,
        message: `Чек ${receipt.number} отправлен на печать${printerName ? ` (принтер: ${printerName})` : ""}`,
      };
    } catch (error) {
      this.logger.error("Error printing receipt:", error);
      return {
        success: false,
        message: "Ошибка при печати чека. Попробуйте ещё раз.",
      };
    } finally {
      // Always clean up temp file, even on error
      if (tempFilePath) {
        fs.unlink(tempFilePath).catch((err) => {
          this.logger.warn(
            `Failed to delete temporary file ${tempFilePath}: ${err.message}`,
          );
        });
      }
    }
  }

  async deleteReceiptFilesForOrder(orderId: string): Promise<void> {
    try {
      // Find all receipts for this order
      const receipts = await this.receiptsRepository.find({
        where: { order_id: orderId },
      });

      // Delete PDF files from disk or object storage
      for (const receipt of receipts) {
        if (receipt.pdf_path) {
          try {
            if (receipt.pdf_path.startsWith("object-storage://")) {
              const parsed = this.pdfStorageService.parseObjectStoragePath(
                receipt.pdf_path,
              );
              if (parsed) {
                await this.pdfStorageService.deleteFile(
                  parsed.bucket,
                  parsed.key,
                );
                this.logger.log(
                  `Deleted receipt file from object storage: ${receipt.pdf_path}`,
                );
              }
            } else {
              await fs.unlink(receipt.pdf_path);
              this.logger.log(`Deleted receipt file: ${receipt.pdf_path}`);
            }
          } catch (error) {
            this.logger.warn(
              `Failed to delete receipt file ${receipt.pdf_path}:`,
              error,
            );
          }
        }
      }

      // Delete receipt records from database
      if (receipts.length > 0) {
        await this.receiptsRepository.delete({ order_id: orderId });
        this.logger.log(
          `Deleted ${receipts.length} receipt records for order ${orderId}`,
        );
      }
    } catch (error) {
      this.logger.error("Error deleting receipt files for order:", error);
      // Don't throw error to avoid breaking order deletion
    }
  }
}
