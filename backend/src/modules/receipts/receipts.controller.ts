import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  Query,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { Response } from "express";
import { ReceiptsService } from "./receipts.service";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";

@ApiTags("receipts")
@Controller("receipts")
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post("orders/:orderId/receipt")
  @ApiOperation({ summary: "Создать чек для заказа" })
  @ApiResponse({ status: 201, description: "Чек успешно создан" })
  @ApiResponse({ status: 400, description: "Невозможно создать чек" })
  @ApiResponse({ status: 404, description: "Заказ не найден" })
  @ApiResponse({ status: 409, description: "Чек для заказа уже существует" })
  createReceipt(@Param("orderId") orderId: string) {
    return this.receiptsService.generateReceipt(orderId);
  }

  @Post("orders/:orderId/receipt/compact")
  @ApiOperation({ summary: "Создать компактный чек для заказа" })
  @ApiResponse({ status: 201, description: "Компактный чек успешно создан" })
  @ApiResponse({ status: 400, description: "Невозможно создать чек" })
  @ApiResponse({ status: 404, description: "Заказ не найден" })
  @ApiResponse({ status: 409, description: "Чек для заказа уже существует" })
  createCompactReceipt(@Param("orderId") orderId: string) {
    return this.receiptsService.generateCompactReceipt(orderId);
  }

  @Post("orders/:orderId/receipt/standard")
  @ApiOperation({ summary: "Создать стандартный чек для заказа" })
  @ApiResponse({ status: 201, description: "Стандартный чек успешно создан" })
  @ApiResponse({ status: 400, description: "Невозможно создать чек" })
  @ApiResponse({ status: 404, description: "Заказ не найден" })
  @ApiResponse({ status: 409, description: "Чек для заказа уже существует" })
  createStandardReceipt(@Param("orderId") orderId: string) {
    return this.receiptsService.generateStandardReceipt(orderId);
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех чеков" })
  @ApiResponse({ status: 200, description: "Список чеков получен" })
  findAll() {
    return this.receiptsService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить метаданные чека" })
  @ApiResponse({ status: 200, description: "Метаданные чека получены" })
  @ApiResponse({ status: 404, description: "Чек не найден" })
  findOne(@Param("id") id: string) {
    return this.receiptsService.findOne(id);
  }

  @Get(":id/pdf")
  @ApiOperation({ summary: "Скачать PDF чек" })
  @ApiResponse({ status: 200, description: "PDF файл получен" })
  @ApiResponse({ status: 404, description: "PDF файл не найден" })
  async getPdf(@Param("id") id: string, @Res() res: Response) {
    try {
      const { buffer, filename } = await this.receiptsService.getReceiptPdf(id);

      // Проверяем, что это действительно PDF
      const isPdf = buffer.toString("ascii", 0, 4) === "%PDF";
      if (!isPdf) {
        console.error("File is not a valid PDF:", filename);
        return res
          .status(400)
          .json({ error: "Файл не является корректным PDF" });
      }

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      });

      res.send(buffer);
    } catch (error) {
      console.error("Error serving PDF:", error);
      res.status(500).json({ error: "Ошибка при получении PDF файла" });
    }
  }

  @Get("printers")
  @ApiOperation({ summary: "Получить список доступных принтеров" })
  @ApiResponse({ status: 200, description: "Список принтеров получен" })
  async getPrinters() {
    return this.receiptsService.getAvailablePrinters();
  }

  @Post(":id/print")
  @ApiOperation({ summary: "Отправить чек на печать" })
  @ApiQuery({
    name: "printer",
    required: false,
    description: "Имя принтера (по умолчанию системный)",
  })
  @ApiResponse({ status: 200, description: "Чек отправлен на печать" })
  @ApiResponse({ status: 404, description: "Чек не найден" })
  @ApiResponse({ status: 500, description: "Ошибка при печати" })
  async printReceipt(
    @Param("id") id: string,
    @Query("printer") printer?: string,
  ) {
    return this.receiptsService.printReceipt(id, printer);
  }

  @Post(":id/regenerate")
  @ApiOperation({ summary: "Принудительно регенерировать PDF чек" })
  @ApiResponse({ status: 200, description: "PDF чек успешно регенерирован" })
  @ApiResponse({ status: 404, description: "Чек не найден" })
  @ApiResponse({ status: 500, description: "Ошибка при регенерации PDF" })
  async regenerateReceiptPdf(@Param("id") id: string) {
    return this.receiptsService.regenerateReceiptPdf(id);
  }
}
