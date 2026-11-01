import { HttpException } from "@nestjs/common";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { ParseUUIDPipe, UseInterceptors, UploadedFile } from "@nestjs/common";
import { selectionSchema } from "../settings/document-config";
import {
  DocumentMultipart,
  documentPayload,
} from "../settings/document-multipart";
import { receiptProjection } from "./services/receipt-projection";
import { regenerationSchema } from "./document-schemas";
import {
  ApiDataResponse,
  ApiDocumentDraftBody,
  ApiFailureResponses,
  ApiJsonBody,
} from "../../openapi/api-docs.decorators";
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  UseGuards,
  Query,
  Request,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Response } from "express";
import { ReceiptsService } from "./receipts.service";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";

@ApiTags("receipts")
@ApiBearerAuth("bearer")
@Controller("receipts")
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  private readonly logger = new Logger(ReceiptsController.name);

  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get("printers")
  @ApiOperation({ summary: "Получить список доступных принтеров" })
  @ApiResponse({ status: 200, description: "Список принтеров получен" })
  async getPrinters() {
    return this.receiptsService.getAvailablePrinters();
  }

  @Post("orders/:orderId/receipt")
  @ApiOperation({ summary: "Создать чек для заказа" })
  @ApiDocumentDraftBody("DocumentSelectionRequest", { required: false })
  @ApiDataResponse(201, "ReceiptProjection", "Чек успешно создан")
  @ApiFailureResponses({
    400: "Невозможно создать чек",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Заказ не найден",
    409: "Чек для заказа уже существует, or the selected preset changed since presetRevision",
    413: "Request above 6 MiB or logo above 5 MiB",
  })
  @UseInterceptors(DocumentMultipart())
  async createReceipt(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return receiptProjection(
      await this.receiptsService.generateReceipt(
        orderId,
        req.user,
        documentPayload(selectionSchema, body, file),
        file,
      ),
    );
  }

  @Post("orders/:orderId/receipt/compact")
  @ApiOperation({ summary: "Создать компактный чек для заказа" })
  @ApiDocumentDraftBody("DocumentSelectionRequest", { required: false })
  @ApiDataResponse(201, "ReceiptProjection", "Компактный чек успешно создан")
  @ApiFailureResponses({
    400: "Невозможно создать чек",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Заказ не найден",
    409: "Чек для заказа уже существует, or the selected preset changed since presetRevision",
    413: "Request above 6 MiB or logo above 5 MiB",
  })
  @UseInterceptors(DocumentMultipart())
  async createCompactReceipt(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return receiptProjection(
      await this.receiptsService.generateReceipt(
        orderId,
        req.user,
        documentPayload(selectionSchema, body, file),
        file,
      ),
    );
  }

  @Post("orders/:orderId/receipt/standard")
  @ApiOperation({ summary: "Создать стандартный чек для заказа" })
  @ApiDocumentDraftBody("DocumentSelectionRequest", { required: false })
  @ApiDataResponse(201, "ReceiptProjection", "Стандартный чек успешно создан")
  @ApiFailureResponses({
    400: "Невозможно создать чек",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Заказ не найден",
    409: "Чек для заказа уже существует, or the selected preset changed since presetRevision",
    413: "Request above 6 MiB or logo above 5 MiB",
  })
  @UseInterceptors(DocumentMultipart())
  async createStandardReceipt(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return receiptProjection(
      await this.receiptsService.generateReceipt(
        orderId,
        req.user,
        documentPayload(selectionSchema, body, file),
        file,
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех чеков" })
  @ApiDataResponse(200, "ReceiptListResponse", "Список чеков получен")
  @ApiQuery({ name: "offset", required: false, description: "Offset" })
  @ApiQuery({ name: "limit", required: false, description: "Limit (max 100)" })
  async findAll(
    @Request() req: { user: User },
    @Query("offset") offset?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const result = await this.receiptsService.findAll(req.user, {
      offset:
        Number.isFinite(parsedOffset) && parsedOffset! >= 0
          ? parsedOffset
          : undefined,
      limit:
        Number.isFinite(parsedLimit) && parsedLimit! > 0
          ? parsedLimit
          : undefined,
    });
    return { ...result, data: result.data.map(receiptProjection) };
  }

  // Declared before ":id" so "retention" is not read as a receipt id.
  @Get("retention")
  @ApiOperation({
    summary: "Receipt retention cap and the receipt the next one would replace",
  })
  async retention(@Request() req: { user: User }) {
    return this.receiptsService.getRetention(req.user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить метаданные чека" })
  @ApiDataResponse(200, "ReceiptProjection", "Метаданные чека получены")
  @ApiResponse({ status: 404, description: "Чек не найден" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: { user: User },
  ) {
    return receiptProjection(await this.receiptsService.findOne(id, req.user));
  }

  @Get(":id/pdf")
  @ApiOperation({ summary: "Скачать PDF чек" })
  @ApiResponse({ status: 200, description: "PDF файл получен" })
  @ApiResponse({ status: 404, description: "PDF файл не найден" })
  async getPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Request() req: { user: User },
  ) {
    try {
      const { buffer, filename } = await this.receiptsService.getReceiptPdf(
        id,
        req.user,
      );

      // Проверяем, что это действительно PDF
      const isPdf = buffer.toString("ascii", 0, 4) === "%PDF";
      if (!isPdf) {
        this.logger.error("File is not a valid PDF:", filename);
        return res.status(400).json({ error: "The file is not a valid PDF" });
      }

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      });

      res.send(buffer);
    } catch (error) {
      this.logger.error("Error serving PDF:", error);
      if (error instanceof HttpException || error instanceof ApiErrorResponse)
        throw error;
      res.status(500).json({ error: "Could not read the PDF file" });
    }
  }

  @Post(":id/print")
  @ApiOperation({ summary: "Отправить чек на печать" })
  @ApiQuery({
    name: "printer",
    required: false,
    description: "Имя принтера (по умолчанию системный)",
  })
  @ApiResponse({ status: 201, description: "Чек отправлен на печать" })
  @ApiResponse({ status: 404, description: "Чек не найден" })
  @ApiResponse({ status: 500, description: "Ошибка при печати" })
  async printReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: { user: User },
    @Query("printer") printer?: string,
  ) {
    return this.receiptsService.printReceipt(id, req.user, printer);
  }

  @Post(":id/void")
  @ApiOperation({ summary: "Void a receipt and unlock the order" })
  @ApiJsonBody("ReceiptVoidRequest", { required: false })
  @ApiDataResponse(201, "ReceiptProjection", "Receipt voided successfully")
  @ApiResponse({ status: 400, description: "Receipt is already voided" })
  @ApiResponse({ status: 404, description: "Receipt not found" })
  async voidReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
    @Request() req: { user: User },
  ) {
    return receiptProjection(
      await this.receiptsService.voidReceipt(id, req.user, body.reason),
    );
  }

  @Post("test-preview")
  @ApiOperation({
    summary: "Generate a test receipt PDF preview using current user settings",
  })
  @ApiResponse({ status: 201, description: "Test PDF generated" })
  async testPreview(@Request() req: { user: User }, @Res() res: Response) {
    try {
      const pdfBuffer = await this.receiptsService.generateTestReceipt(
        req.user,
      );
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="test-receipt.pdf"',
        "Content-Length": pdfBuffer.length.toString(),
      });
      res.send(pdfBuffer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  @Post(":id/regenerate")
  @ApiOperation({ summary: "Принудительно регенерировать PDF чек" })
  @ApiDocumentDraftBody("ReceiptRegenerationRequest", { required: false })
  @ApiDataResponse(201, "ReceiptProjection", "PDF чек успешно регенерирован")
  @ApiFailureResponses({
    400: "Invalid body, or reproduce combined with new configuration",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Чек не найден",
    409: "Stale expectedActiveRevision or preset revision, replacement already running, or reconstruction required",
    413: "Request above 6 MiB or logo above 5 MiB",
  })
  @ApiResponse({ status: 500, description: "Ошибка при регенерации PDF" })
  @UseInterceptors(DocumentMultipart())
  async regenerateReceiptPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const {
      mode,
      expectedActiveRevision,
      confirmReconstruction,
      ...selection
    } = documentPayload(regenerationSchema, body, file);
    if (
      mode === "reproduce" &&
      (file ||
        selection.config ||
        selection.presetId ||
        selection.overrides ||
        selection.logoAction !== "keep")
    )
      throw new (await import("@nestjs/common")).BadRequestException(
        "Reproduce cannot apply new configuration; use replace",
      );
    return receiptProjection(
      await this.receiptsService.regenerateReceiptPdf(
        id,
        req.user,
        { mode, expectedActiveRevision, confirmReconstruction, selection },
        file,
      ),
    );
  }

  @Post(":id/share")
  @ApiOperation({ summary: "Generate a public share link for a receipt" })
  @ApiDataResponse(201, "ReceiptShareResponse", "Public link generated")
  @ApiResponse({ status: 404, description: "Receipt not found" })
  async shareReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: { user: User },
  ) {
    return this.receiptsService.generatePublicToken(id, req.user);
  }

  @Post(":id/share/revoke")
  @ApiOperation({ summary: "Revoke public share link for a receipt" })
  @ApiDataResponse(201, "ReceiptProjection", "Public link revoked")
  @ApiResponse({ status: 404, description: "Receipt not found" })
  async revokeShareReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: { user: User },
  ) {
    return receiptProjection(
      await this.receiptsService.revokePublicToken(id, req.user),
    );
  }
}
