import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import { ReactPdfGeneratorService } from "./services/react-pdf-generator.service";
import { CompactPdfGeneratorService } from "./services/compact-pdf-generator.service";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { ConfigService } from "@nestjs/config";

const execAsync = promisify(exec);

@Injectable()
export class ReceiptsService {
  private readonly MAX_RECEIPTS = 10; // Максимальное количество чеков

  constructor(
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private reactPdfGeneratorService: ReactPdfGeneratorService,
    private compactPdfGeneratorService: CompactPdfGeneratorService,
    @InjectDataSource()
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  async generateReceipt(orderId: string): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      // Проверяем существование заказа
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ["recipient", "items"],
      });
      if (!order) {
        throw new NotFoundException("Заказ не найден");
      }

      // Проверяем статус заказа
      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          "Можно создать чек только для подтвержденного заказа",
        );
      }

      // Проверяем, что чек еще не создан
      const existingReceipt = await manager.findOne(Receipt, {
        where: { order_id: orderId, status: ReceiptStatus.GENERATED },
      });
      if (existingReceipt) {
        throw new ConflictException("Чек для этого заказа уже существует");
      }

      // Очищаем старые чеки перед созданием нового
      await this.cleanupOldReceipts(manager);

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Получаем название компании из настроек
      const companyName = await this.getCompanyName();

      // Генерируем PDF (используем компактный генератор по умолчанию)
      const { filePath, url } =
        await this.compactPdfGeneratorService.generateReceiptPdf(
          order,
          receiptNumber,
          companyName,
        );

      // Вычисляем хеш файла для контроля целостности
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Создаем запись о чеке
      const receipt = manager.create(Receipt, {
        order_id: orderId,
        number: receiptNumber,
        pdf_path: filePath,
        pdf_url: url,
        hash,
        status: ReceiptStatus.GENERATED,
      });

      return manager.save(Receipt, receipt);
    });
  }

  async generateCompactReceipt(orderId: string): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      // Проверяем существование заказа
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ["recipient", "items"],
      });
      if (!order) {
        throw new NotFoundException("Заказ не найден");
      }

      // Проверяем статус заказа
      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          "Можно создать чек только для подтвержденного заказа",
        );
      }

      // Проверяем, что чек еще не создан
      const existingReceipt = await manager.findOne(Receipt, {
        where: { order_id: orderId, status: ReceiptStatus.GENERATED },
      });
      if (existingReceipt) {
        throw new ConflictException("Чек для этого заказа уже существует");
      }

      // Очищаем старые чеки перед созданием нового
      await this.cleanupOldReceipts(manager);

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Получаем название компании из настроек
      const companyName = await this.getCompanyName();

      // Генерируем компактный PDF
      const { filePath, url } =
        await this.compactPdfGeneratorService.generateReceiptPdf(
          order,
          receiptNumber,
          companyName,
        );

      // Вычисляем хеш файла для контроля целостности
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Создаем запись о чеке
      const receipt = manager.create(Receipt, {
        order_id: orderId,
        number: receiptNumber,
        pdf_path: filePath,
        pdf_url: url,
        hash,
        status: ReceiptStatus.GENERATED,
      });

      return manager.save(Receipt, receipt);
    });
  }

  async generateStandardReceipt(orderId: string): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      // Проверяем существование заказа
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ["recipient", "items"],
      });
      if (!order) {
        throw new NotFoundException("Заказ не найден");
      }

      // Проверяем статус заказа
      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          "Можно создать чек только для подтвержденного заказа",
        );
      }

      // Проверяем, что чек еще не создан
      const existingReceipt = await manager.findOne(Receipt, {
        where: { order_id: orderId, status: ReceiptStatus.GENERATED },
      });
      if (existingReceipt) {
        throw new ConflictException("Чек для этого заказа уже существует");
      }

      // Очищаем старые чеки перед созданием нового
      await this.cleanupOldReceipts(manager);

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Получаем название компании из настроек
      const companyName = await this.getCompanyName();

      // Генерируем стандартный PDF
      const { filePath, url } =
        await this.reactPdfGeneratorService.generateReceiptPdf(
          order,
          receiptNumber,
          companyName,
        );

      // Вычисляем хеш файла для контроля целостности
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Создаем запись о чеке
      const receipt = manager.create(Receipt, {
        order_id: orderId,
        number: receiptNumber,
        pdf_path: filePath,
        pdf_url: url,
        hash,
        status: ReceiptStatus.GENERATED,
      });

      return manager.save(Receipt, receipt);
    });
  }

  async findAll(): Promise<Receipt[]> {
    return this.receiptsRepository.find({
      relations: ["order", "order.recipient"],
      order: { created_at: "DESC" },
    });
  }

  async findOne(id: string): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id },
      relations: ["order", "order.recipient", "order.items"],
    });
    if (!receipt) {
      throw new NotFoundException("Чек не найден");
    }
    return receipt;
  }

  async getReceiptPdf(
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.findOne(id);

    if (!receipt.pdf_path) {
      throw new NotFoundException("PDF файл не найден");
    }

    try {
      // Проверяем существование файла на диске
      await fs.access(receipt.pdf_path);
      const buffer = await fs.readFile(receipt.pdf_path);
      const filename = `receipt-${receipt.number}.pdf`;

      return { buffer, filename };
    } catch (error) {
      // Если файл не найден на диске, пытаемся регенерировать его
      console.log(`PDF файл не найден на диске: ${receipt.pdf_path}, пытаемся регенерировать...`);
      
      try {
        // Получаем заказ для регенерации
        const order = await this.ordersRepository.findOne({
          where: { id: receipt.order_id },
          relations: ["recipient", "items"],
        });

        if (!order) {
          throw new NotFoundException("Заказ не найден для регенерации PDF");
        }

        // Регенерируем PDF
        const companyName = await this.getCompanyName();
        const { filePath, url } = await this.compactPdfGeneratorService.generateReceiptPdf(
          order,
          receipt.number,
          companyName,
        );

        // Обновляем путь к файлу в базе данных
        receipt.pdf_path = filePath;
        receipt.pdf_url = url;
        await this.receiptsRepository.save(receipt);

        // Читаем новый файл
        const buffer = await fs.readFile(filePath);
        const filename = `receipt-${receipt.number}.pdf`;

        console.log(`PDF успешно регенерирован: ${filePath}`);
        return { buffer, filename };
      } catch (regenerateError) {
        console.error("Ошибка при регенерации PDF:", regenerateError);
        throw new NotFoundException("PDF файл не найден и не может быть регенерирован");
      }
    }
  }

  async regenerateReceiptPdf(id: string): Promise<Receipt> {
    const receipt = await this.findOne(id);

    // Получаем заказ для регенерации
    const order = await this.ordersRepository.findOne({
      where: { id: receipt.order_id },
      relations: ["recipient", "items"],
    });

    if (!order) {
      throw new NotFoundException("Заказ не найден для регенерации PDF");
    }

    // Удаляем старый файл, если он существует
    if (receipt.pdf_path) {
      try {
        await fs.unlink(receipt.pdf_path);
        console.log(`Старый PDF файл удален: ${receipt.pdf_path}`);
      } catch (error) {
        console.warn(`Не удалось удалить старый PDF файл: ${error.message}`);
      }
    }

    // Регенерируем PDF
    const companyName = await this.getCompanyName();
    const { filePath, url } = await this.compactPdfGeneratorService.generateReceiptPdf(
      order,
      receipt.number,
      companyName,
    );

    // Вычисляем хеш нового файла
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Обновляем запись о чеке
    receipt.pdf_path = filePath;
    receipt.pdf_url = url;
    receipt.hash = hash;

    const updatedReceipt = await this.receiptsRepository.save(receipt);
    console.log(`PDF успешно регенерирован: ${filePath}`);

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
      console.error("Error generating receipt number:", error);
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
      console.error("Error ensuring receipt number function:", error);
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
      console.error("Error reading company name:", error);
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

        // Удаляем файлы с диска
        for (const receipt of oldReceipts) {
          if (receipt.pdf_path) {
            try {
              await fs.unlink(receipt.pdf_path);
              console.log(`Deleted receipt file: ${receipt.pdf_path}`);
            } catch (error) {
              console.warn(
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
          console.log(`Cleaned up ${oldReceipts.length} old receipts`);
        }
      }
    } catch (error) {
      console.error("Error cleaning up old receipts:", error);
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
      console.error("Error getting printers:", error);
      return { printers: [] };
    }
  }

  async printReceipt(
    receiptId: string,
    printerName?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Получаем чек
      const receipt = await this.findOne(receiptId);

      if (!receipt.pdf_path) {
        throw new Error("PDF файл не найден");
      }

      // Проверяем существование файла
      try {
        await fs.access(receipt.pdf_path);
      } catch {
        throw new Error("PDF файл не найден на диске");
      }

      // Определяем команду печати в зависимости от операционной системы
      let printCommand: string;
      const platform = process.platform;

      if (platform === "darwin") {
        // macOS
        printCommand = printerName
          ? `lpr -P "${printerName}" "${receipt.pdf_path}"`
          : `lpr "${receipt.pdf_path}"`;
      } else if (platform === "linux") {
        // Linux
        printCommand = printerName
          ? `lp -d "${printerName}" "${receipt.pdf_path}"`
          : `lp "${receipt.pdf_path}"`;
      } else if (platform === "win32") {
        // Windows
        printCommand = printerName
          ? `powershell -Command "Start-Process -FilePath '${receipt.pdf_path}' -Verb Print -WindowStyle Hidden"`
          : `powershell -Command "Start-Process -FilePath '${receipt.pdf_path}' -Verb Print -WindowStyle Hidden"`;
      } else {
        throw new Error(`Неподдерживаемая операционная система: ${platform}`);
      }

      // Выполняем команду печати
      console.log(
        `Printing receipt ${receipt.number} with command: ${printCommand}`,
      );
      const { stderr } = await execAsync(printCommand);

      if (stderr && !stderr.includes("warning")) {
        console.error("Print command stderr:", stderr);
        throw new Error(`Ошибка печати: ${stderr}`);
      }

      console.log(`Receipt ${receipt.number} sent to printer successfully`);
      return {
        success: true,
        message: `Чек ${receipt.number} отправлен на печать${printerName ? ` (принтер: ${printerName})` : ""}`,
      };
    } catch (error) {
      console.error("Error printing receipt:", error);
      return {
        success: false,
        message: `Ошибка при печати чека: ${error.message}`,
      };
    }
  }
}
