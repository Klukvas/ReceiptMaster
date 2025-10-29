import { Injectable, Logger } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import { PdfGeneratorService, ReceiptStyle } from "./services/pdf-generator.service";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { User } from "../users/entities/user.entity";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { ConfigService } from "@nestjs/config";
import { SettingsService } from "../settings/services/settings.service";

const execAsync = promisify(exec);

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly MAX_RECEIPTS = 10; // Максимальное количество чеков

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
  ) {}

  private getReceiptStyleFromTemplateId(templateId: string): ReceiptStyle {
    switch (templateId) {
      case 'standard':
        return ReceiptStyle.STANDARD;
      case 'compact':
        return ReceiptStyle.COMPACT;
      case 'classic':
        return ReceiptStyle.CLASSIC;
      case 'modern':
        return ReceiptStyle.MODERN;
      case 'elegant':
        return ReceiptStyle.ELEGANT;
      case 'vintage':
        return ReceiptStyle.VINTAGE;
      case 'tech':
        return ReceiptStyle.TECH;
      case 'wave':
        return ReceiptStyle.WAVE;
      case 'minimal':
        return ReceiptStyle.MINIMAL;
      default:
        this.logger.warn(`Unknown template ID: ${templateId}, falling back to COMPACT`);
        return ReceiptStyle.COMPACT;
    }
  }

  async generateReceipt(orderId: string, user: User): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
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

      // Проверяем, что чек еще не создан
      const existingReceipt = await manager.findOne(Receipt, {
        where: { order_id: orderId, status: ReceiptStatus.GENERATED },
      });
      if (existingReceipt) {
        throw ApiErrors.RECEIPT_ALREADY_EXISTS(orderId);
      }

      // Очищаем старые чеки перед созданием нового
      await this.cleanupOldReceipts(manager);

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Получаем название компании из настроек
      const companyName = await this.getCompanyName();

      // Получаем шаблон пользователя из настроек
      const userTemplateId = await this.settingsService.getUserTemplate(user.id);
      const receiptStyle = this.getReceiptStyleFromTemplateId(userTemplateId);
      
      // Получаем заголовок чека из настроек
      const receiptTitle = await this.settingsService.getReceiptTitle(user.id);
      
      // Получаем язык шаблона из настроек
      const templateLanguage = await this.settingsService.getTemplateLanguage(user.id);
      
      // Получаем footer настройки из настроек
      const footerTitle = await this.settingsService.getFooterTitle(user.id);
      const footerSubtitle = await this.settingsService.getFooterSubtitle(user.id);
      
      // Получаем header настройки из настроек
      const headerTitle = await this.settingsService.getHeaderTitle(user.id);
      
      this.logger.log(`Using template for user ${user.id}: ${userTemplateId} -> ${receiptStyle}`);
      this.logger.log(`Using receipt title for user ${user.id}: ${receiptTitle}`);
      this.logger.log(`Using template language for user ${user.id}: ${templateLanguage}`);
      this.logger.log(`Using footer title for user ${user.id}: ${footerTitle || 'default'}`);
      this.logger.log(`Using footer subtitle for user ${user.id}: ${footerSubtitle || 'default'}`);
      this.logger.log(`Using header title for user ${user.id}: ${headerTitle || 'default (companyName)'}`);

      // Генерируем PDF с пользовательским шаблоном
      const { filePath, url } =
        await this.pdfGeneratorService.generateReceiptPdf(
          order,
          receiptNumber,
          companyName,
          user.id,
          receiptStyle,
          receiptTitle,
          templateLanguage,
          footerTitle,
          footerSubtitle,
          headerTitle
        );

      // Вычисляем хеш файла для контроля целостности
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

      // Создаем запись о чеке
      const receipt = manager.create(Receipt, {
        order_id: orderId,
        number: receiptNumber,
        pdf_path: filePath,
        pdf_url: url,
        hash,
        status: ReceiptStatus.GENERATED,
        user_id: user.id,
      });

      return manager.save(Receipt, receipt);
    });
  }

  async generateCompactReceipt(orderId: string, user: User): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
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

      // Проверяем, что чек еще не создан
      const existingReceipt = await manager.findOne(Receipt, {
        where: { order_id: orderId, status: ReceiptStatus.GENERATED },
      });
      if (existingReceipt) {
        throw ApiErrors.RECEIPT_ALREADY_EXISTS(orderId);
      }

      // Очищаем старые чеки перед созданием нового
      await this.cleanupOldReceipts(manager);

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Получаем название компании из настроек
      const companyName = await this.getCompanyName();

      // Получаем настройки для footer
      const footerTitle = await this.settingsService.getFooterTitle(user.id);
      const footerSubtitle = await this.settingsService.getFooterSubtitle(user.id);
      
      // Получаем header настройки
      const headerTitle = await this.settingsService.getHeaderTitle(user.id);

      // Генерируем компактный PDF
      const { filePath, url } =
        await this.pdfGeneratorService.generateReceiptPdf(
          order,
          receiptNumber,
          companyName,
          user.id,
          ReceiptStyle.COMPACT,
          'Invoice',
          'en',
          footerTitle,
          footerSubtitle,
          headerTitle
        );

      // Вычисляем хеш файла для контроля целостности
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

      // Создаем запись о чеке
      const receipt = manager.create(Receipt, {
        order_id: orderId,
        number: receiptNumber,
        pdf_path: filePath,
        pdf_url: url,
        hash,
        status: ReceiptStatus.GENERATED,
        user_id: user.id,
      });

      return manager.save(Receipt, receipt);
    });
  }

  async generateStandardReceipt(orderId: string, user: User): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
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

      // Проверяем, что чек еще не создан
      const existingReceipt = await manager.findOne(Receipt, {
        where: { order_id: orderId, status: ReceiptStatus.GENERATED },
      });
      if (existingReceipt) {
        throw ApiErrors.RECEIPT_ALREADY_EXISTS(orderId);
      }

      // Очищаем старые чеки перед созданием нового
      await this.cleanupOldReceipts(manager);

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Получаем название компании из настроек
      const companyName = await this.getCompanyName();

      // Генерируем стандартный PDF
      const { filePath, url } =
        await this.pdfGeneratorService.generateReceiptPdf(
          order,
          receiptNumber,
          companyName,
          user.id,
          ReceiptStyle.STANDARD
        );

      // Вычисляем хеш файла для контроля целостности
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

      // Создаем запись о чеке
      const receipt = manager.create(Receipt, {
        order_id: orderId,
        number: receiptNumber,
        pdf_path: filePath,
        pdf_url: url,
        hash,
        status: ReceiptStatus.GENERATED,
        user_id: user.id,
      });

      return manager.save(Receipt, receipt);
    });
  }

  async findAll(user: User): Promise<Receipt[]> {
    return this.receiptsRepository.find({
      where: { user_id: user.id },
      relations: ["order", "order.recipient"],
      order: { created_at: "DESC" },
    });
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

        // Регенерируем PDF
        const companyName = await this.getCompanyName();
        const templateLanguage = await this.settingsService.getTemplateLanguage(user.id);
        const { filePath, url } =
          await this.pdfGeneratorService.generateReceiptPdf(
            order,
            receipt.number,
            companyName,
            user.id,
            ReceiptStyle.COMPACT,
            'Invoice',
            templateLanguage
          );

        // Обновляем путь к файлу в базе данных
        receipt.pdf_path = filePath;
        receipt.pdf_url = url;
        await this.receiptsRepository.save(receipt);

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

    // Регенерируем PDF
    const companyName = await this.getCompanyName();
    const templateLanguage = await this.settingsService.getTemplateLanguage(user.id);
    const { filePath, url } =
      await this.pdfGeneratorService.generateReceiptPdf(
        order,
        receipt.number,
        companyName,
        user.id,
        ReceiptStyle.COMPACT,
        'Invoice',
        templateLanguage
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

    // Обновляем запись о чеке
    receipt.pdf_path = filePath;
    receipt.pdf_url = url;
    receipt.hash = hash;

    const updatedReceipt = await this.receiptsRepository.save(receipt);
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
    try {
      // Проверяем, существует ли функция
      const checkResult = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc 
          WHERE proname = 'generate_receipt_number'
        ) as exists
      `);

      if (!checkResult[0].exists) {
        // Создаем sequence если не существует
        await this.dataSource.query(`
          CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1
        `);

        // Создаем функцию
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
    } catch (error) {
      this.logger.error("Error ensuring receipt number function:", error);
      throw error;
    }
  }

  private async getCompanyName(): Promise<string> {
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
        return settings.companyName || "";
      } catch {
        // If settings file doesn't exist, return empty string
        return "";
      }
    } catch (error) {
      this.logger.error("Error reading company name:", error);
      return "";
    }
  }

  private async cleanupOldReceipts(manager: any): Promise<void> {
    try {
      // Получаем общее количество чеков
      const totalReceipts = await manager.count(Receipt, {
        where: { status: ReceiptStatus.GENERATED },
      });

      // Если чеков больше максимального количества, удаляем старые
      if (totalReceipts >= this.MAX_RECEIPTS) {
        // Получаем старые чеки (оставляем MAX_RECEIPTS-1 самых новых)
        const oldReceipts = await manager.find(Receipt, {
          where: { status: ReceiptStatus.GENERATED },
          order: { created_at: "ASC" },
          take: totalReceipts - (this.MAX_RECEIPTS - 1), // Удаляем все кроме MAX_RECEIPTS-1 самых новых
        });

        // Удаляем файлы из object storage
        for (const receipt of oldReceipts) {
          if (
            receipt.pdf_path &&
            receipt.pdf_path.startsWith("object-storage://")
          ) {
            try {
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
            } catch (error) {
              this.logger.warn(
                `Failed to delete receipt file ${receipt.pdf_path}:`,
                error,
              );
            }
          }
        }

        // Удаляем записи из базы данных
        if (oldReceipts.length > 0) {
          const receiptIds = oldReceipts.map((receipt) => receipt.id);
          await manager.delete(Receipt, receiptIds);
          this.logger.log(`Cleaned up ${oldReceipts.length} old receipts`);
        }
      }
    } catch (error) {
      this.logger.error("Error cleaning up old receipts:", error);
      // Не прерываем создание чека из-за ошибки очистки
    }
  }

  async getAvailablePrinters(): Promise<{ printers: string[] }> {
    try {
      const platform = process.platform;
      let command: string;

      if (platform === "darwin") {
        // macOS
        command = "lpstat -p | grep \"printer\" | awk '{print $2}'";
      } else if (platform === "linux") {
        // Linux
        command = "lpstat -p | grep \"printer\" | awk '{print $2}'";
      } else if (platform === "win32") {
        // Windows
        command =
          'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"';
      } else {
        return { printers: [] };
      }

      const { stdout } = await execAsync(command);
      const printers = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return { printers };
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
    try {
      // Получаем чек
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

      // Для object storage файлов нужно сначала скачать их
      let tempFilePath: string | null = null;
      let filePathToPrint = receipt.pdf_path;

      if (receipt.pdf_path.startsWith("object-storage://")) {
        // Скачиваем файл из object storage во временную папку
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

        // Создаем папку temp если её нет
        await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
        await fs.writeFile(tempFilePath, fileBuffer);
        filePathToPrint = tempFilePath;
      }

      // Определяем команду печати в зависимости от операционной системы
      let printCommand: string;
      const platform = process.platform;

      if (platform === "darwin") {
        // macOS
        printCommand = printerName
          ? `lpr -P "${printerName}" "${filePathToPrint}"`
          : `lpr "${filePathToPrint}"`;
      } else if (platform === "linux") {
        // Linux
        printCommand = printerName
          ? `lp -d "${printerName}" "${filePathToPrint}"`
          : `lp "${filePathToPrint}"`;
      } else if (platform === "win32") {
        // Windows
        printCommand = printerName
          ? `powershell -Command "Start-Process -FilePath '${filePathToPrint}' -Verb Print -WindowStyle Hidden"`
          : `powershell -Command "Start-Process -FilePath '${filePathToPrint}' -Verb Print -WindowStyle Hidden"`;
      } else {
        throw ApiErrors.BAD_REQUEST(
          `Unsupported operating system: ${platform}`,
        );
      }

      // Выполняем команду печати
      this.logger.log(
        `Printing receipt ${receipt.number} with command: ${printCommand}`,
      );
      const { stderr } = await execAsync(printCommand);

      // Удаляем временный файл если он был создан
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
          this.logger.log(`Temporary file deleted: ${tempFilePath}`);
        } catch (error) {
          this.logger.warn(`Failed to delete temporary file: ${error.message}`);
        }
      }

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
        message: `Ошибка при печати чека: ${error.message}`,
      };
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
