import { pdfDisposition } from "./content-disposition";
import {
  applyDecorators,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { ApiErrorResponse, ApiErrors } from "../../common/errors/ApiError";
import { DocumentType } from "./entities/receipt.entity";
import { ParseUUIDPipe, UseInterceptors, UploadedFile } from "@nestjs/common";
import { selectionSchema } from "../settings/document-config";
import {
  DocumentMultipart,
  documentPayload,
} from "../settings/document-multipart";
import { VoidReceiptDto } from "./dto/void-receipt.dto";
import { ListDocumentsQueryDto } from "./dto/list-documents-query.dto";
import {
  documentListItem,
  issuedDocument,
  receiptProjection,
} from "./services/receipt-projection";
import {
  documentGenerationSchema,
  documentTypeProbe,
  regenerationSchema,
} from "./document-schemas";
import { isGeneratableType } from "./document-types";
import type { DocumentDetailsInput } from "./frozen-document";
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
import { Throttle } from "@nestjs/throttler";
import {
  ThrottleBucket,
  UserThrottlerGuard,
} from "../../common/guards/user-throttler.guard";
import { ReceiptsService } from "./receipts.service";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";

/**
 * Issuing renders a PDF, so it is limited per user; a person clicking cannot reach this.
 * The three receipt routes, `/documents` and `/regenerate` count in ONE bucket: 20 a minute
 * in all, not 20 on each of the five routes.
 */
const ISSUE_THROTTLE = { default: { ttl: 60_000, limit: 20 } } as const;
const IssueThrottle = () =>
  applyDecorators(
    UseGuards(UserThrottlerGuard),
    Throttle(ISSUE_THROTTLE),
    ThrottleBucket("document-issue"),
  );
/** A sample-data PDF render (Playwright). */
export const PREVIEW_THROTTLE = {
  default: { ttl: 60_000, limit: 10 },
} as const;
const RATE_LIMITED = "More requests than allowed per minute (RATE_LIMITED)";

function isDocumentType(value: string): value is DocumentType {
  return (Object.values(DocumentType) as string[]).includes(value);
}

@ApiTags("receipts")
@ApiBearerAuth("bearer")
@Controller("receipts")
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  private readonly logger = new Logger(ReceiptsController.name);

  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post("orders/:orderId/receipt")
  @IssueThrottle()
  @ApiOperation({ summary: "Создать чек для заказа" })
  @ApiDocumentDraftBody("DocumentSelectionRequest", { required: false })
  @ApiDataResponse(201, "ReceiptIssueResult", "Чек успешно создан")
  @ApiFailureResponses({
    400: "Невозможно создать чек",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Заказ не найден",
    409: "Чек для заказа уже существует, or the selected preset changed since presetRevision",
    413: "Request above 6 MiB or logo above 5 MiB",
    429: RATE_LIMITED,
  })
  @UseInterceptors(DocumentMultipart())
  async createReceipt(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return issuedDocument(
      await this.receiptsService.generateReceipt(
        orderId,
        req.user,
        documentPayload(selectionSchema, body, file),
        file,
      ),
    );
  }

  @Post("orders/:orderId/receipt/compact")
  @IssueThrottle()
  @ApiOperation({ summary: "Создать компактный чек для заказа" })
  @ApiDocumentDraftBody("DocumentSelectionRequest", { required: false })
  @ApiDataResponse(201, "ReceiptIssueResult", "Компактный чек успешно создан")
  @ApiFailureResponses({
    400: "Невозможно создать чек",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Заказ не найден",
    409: "Чек для заказа уже существует, or the selected preset changed since presetRevision",
    413: "Request above 6 MiB or logo above 5 MiB",
    429: RATE_LIMITED,
  })
  @UseInterceptors(DocumentMultipart())
  async createCompactReceipt(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return issuedDocument(
      await this.receiptsService.generateReceipt(
        orderId,
        req.user,
        documentPayload(selectionSchema, body, file),
        file,
      ),
    );
  }

  @Post("orders/:orderId/receipt/standard")
  @IssueThrottle()
  @ApiOperation({ summary: "Создать стандартный чек для заказа" })
  @ApiDocumentDraftBody("DocumentSelectionRequest", { required: false })
  @ApiDataResponse(201, "ReceiptIssueResult", "Стандартный чек успешно создан")
  @ApiFailureResponses({
    400: "Невозможно создать чек",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Заказ не найден",
    409: "Чек для заказа уже существует, or the selected preset changed since presetRevision",
    413: "Request above 6 MiB or logo above 5 MiB",
    429: RATE_LIMITED,
  })
  @UseInterceptors(DocumentMultipart())
  async createStandardReceipt(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return issuedDocument(
      await this.receiptsService.generateReceipt(
        orderId,
        req.user,
        documentPayload(selectionSchema, body, file),
        file,
      ),
    );
  }

  @Post("orders/:orderId/documents")
  @IssueThrottle()
  @ApiOperation({
    summary:
      "Generate a document of the given type (waybill, invoice, act, sales receipt, packing list, quotation or goods return note) for an order",
  })
  @ApiDocumentDraftBody("DocumentGenerationRequest")
  @ApiDataResponse(201, "ReceiptIssueResult", "Document generation started")
  @ApiFailureResponses({
    400: "Invalid body or details, unsupported document type (DOCUMENT_TYPE_NOT_SUPPORTED), order status not allowed for the type (ORDER_CANNOT_BE_MODIFIED: a quotation takes a draft or confirmed order, every other type a confirmed one; a goods return note needs `details.lines`), or a style that cannot carry the document (DOCUMENT_TEMPLATE_UNSUPPORTED)",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Order not found",
    409: "A live document of this type already exists, or a voided one of a type that cannot be reissued (DOCUMENT_ALREADY_EXISTS, or RECEIPT_ALREADY_EXISTS for a waybill); a voided invoice, act or quotation can be issued again under a new number. Also returned when the order/defaults changed while preparing, and when the type's number counter has reached the largest possible number (DOCUMENT_NUMBERS_EXHAUSTED)",
    413: "Request above 6 MiB or logo above 5 MiB",
    429: RATE_LIMITED,
    422: "Required requisites are missing (DOCUMENT_REQUISITES_MISSING); `fields` lists them. A goods return note asking for more than is left to return is refused with RETURN_QUANTITY_EXCEEDED; `items` lists each line with the requested and remaining quantity",
  })
  @UseInterceptors(DocumentMultipart())
  async createDocument(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Request() req: { user: User },
    @Body() body: unknown = {},
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // The type is read first so an unsupported one is refused before details are judged.
    const { type } = documentPayload(documentTypeProbe, body, file);
    if (!isGeneratableType(type))
      throw ApiErrors.DOCUMENT_TYPE_NOT_SUPPORTED(type);
    const parsed = documentPayload(documentGenerationSchema, body, file);
    const details: DocumentDetailsInput | undefined =
      "details" in parsed ? parsed.details : undefined;
    return issuedDocument(
      await this.receiptsService.generateDocument(
        orderId,
        req.user,
        type,
        {
          config: parsed.config,
          presetId: parsed.presetId,
          presetRevision: parsed.presetRevision,
          overrides: parsed.overrides,
          logoAction: parsed.logoAction,
        },
        details,
        file,
      ),
    );
  }

  @Get()
  @ApiOperation({
    summary:
      "List documents with filters, search and sorting, each with its order and recipient name",
  })
  @ApiDataResponse(200, "ReceiptListResponse", "Page of documents")
  @ApiFailureResponses({ 400: "Invalid query parameter" })
  async findAll(
    @Request() req: { user: User },
    @Query() query: ListDocumentsQueryDto,
  ) {
    const result = await this.receiptsService.findAll(req.user, query);
    return { ...result, data: result.data.map(documentListItem) };
  }

  // Declared before ":id" so "retention" is not read as a receipt id.
  @Get("retention")
  @ApiOperation({
    summary: "Receipt retention cap and the receipt the next one would replace",
  })
  @ApiQuery({
    name: "type",
    required: false,
    enum: DocumentType,
    description: "Document type to count (default: waybill)",
  })
  @ApiFailureResponses({
    400: "type is not a document type (VALIDATION_ERROR)",
  })
  async retention(
    @Request() req: { user: User },
    @Query("type") type?: string,
  ) {
    if (type === undefined) return this.receiptsService.getRetention(req.user);
    if (!isDocumentType(type))
      throw ApiErrors.VALIDATION_ERROR(
        "type",
        `type must be one of: ${Object.values(DocumentType).join(", ")}`,
      );
    return this.receiptsService.getRetention(req.user, type);
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
        "Content-Disposition": pdfDisposition(filename),
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

  @Post(":id/void")
  @ApiOperation({ summary: "Void a receipt and unlock the order" })
  @ApiJsonBody("ReceiptVoidRequest", { required: false })
  @ApiDataResponse(201, "ReceiptProjection", "Receipt voided successfully")
  @ApiResponse({
    status: 400,
    description:
      "Receipt is already voided, or `reason` is not a string of at most 500 characters",
  })
  @ApiResponse({ status: 404, description: "Receipt not found" })
  @ApiResponse({
    status: 409,
    description:
      "A waybill, sales receipt or packing list that is still processing or failed cannot be voided (DOCUMENT_NOT_VOIDABLE): its void would close the order's slot for that type for good; retry the generation instead",
  })
  async voidReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: VoidReceiptDto,
    @Request() req: { user: User },
  ) {
    return receiptProjection(
      await this.receiptsService.voidReceipt(
        id,
        req.user,
        body?.reason || undefined,
      ),
    );
  }

  @Post("test-preview")
  @UseGuards(UserThrottlerGuard)
  @Throttle(PREVIEW_THROTTLE)
  @ApiOperation({
    summary: "Generate a test receipt PDF preview using current user settings",
  })
  @ApiResponse({ status: 201, description: "Test PDF generated" })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  @ApiResponse({ status: 500, description: "Could not generate the preview" })
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
      // The cause (renderer, storage, template) stays in the log; the client gets no detail.
      this.logger.error("Test preview failed", error);
      res.status(500).json({
        error: "Could not generate the preview",
        errorCode: "PREVIEW_FAILED",
      });
    }
  }

  @Post(":id/regenerate")
  @IssueThrottle()
  @ApiOperation({ summary: "Принудительно регенерировать PDF чек" })
  @ApiDocumentDraftBody("ReceiptRegenerationRequest", { required: false })
  @ApiDataResponse(201, "ReceiptIssueResult", "PDF чек успешно регенерирован")
  @ApiFailureResponses({
    400: "Invalid body, or reproduce combined with new configuration",
    402: "Template not available on the current plan (TEMPLATE_PLAN_RESTRICTED)",
    404: "Чек не найден",
    409: "Stale expectedActiveRevision or preset revision, replacement already running, or reconstruction required",
    413: "Request above 6 MiB or logo above 5 MiB",
    429: RATE_LIMITED,
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
      throw new BadRequestException(
        "Reproduce cannot apply new configuration; use replace",
      );
    return issuedDocument(
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
  @ApiFailureResponses({
    400: "Only a generated document can be shared (not one still processing, failed or voided)",
    404: "Document not found, or its order was deleted",
  })
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
