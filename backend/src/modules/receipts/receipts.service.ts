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
import * as crypto from "crypto";
import * as fs from "fs/promises";
// import * as path from "path";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private reactPdfGeneratorService: ReactPdfGeneratorService,
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

      // Генерируем номер чека
      const receiptNumber = await this.generateReceiptNumber();

      // Генерируем PDF
      const { filePath, url } =
        await this.reactPdfGeneratorService.generateReceiptPdf(
          order,
          receiptNumber,
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
      const buffer = await fs.readFile(receipt.pdf_path);
      const filename = `receipt-${receipt.number}.pdf`;

      return { buffer, filename };
    } catch (error) {
      throw new NotFoundException("PDF файл не найден на диске");
    }
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
}
