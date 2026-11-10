import {
  Body,
  Controller,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { Order } from "../orders/entities/order.entity";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { DocumentConfigService } from "../settings/services/document-config.service";
import {
  DocumentMultipart,
  documentPayload,
} from "../settings/document-multipart";
import {
  DocumentRenderService,
  sampleOrder,
} from "./services/document-render.service";
import { ApiErrors } from "../../common/errors/ApiError";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ApiDocumentDraftBody,
  ApiFailureResponses,
  ApiPdfResponse,
} from "../../openapi/api-docs.decorators";
import { previewSchema } from "./document-schemas";
@ApiTags("receipts")
@ApiBearerAuth("bearer")
@Controller("receipts")
@UseGuards(JwtAuthGuard)
export class DocumentPreviewController {
  constructor(
    private readonly configs: DocumentConfigService,
    private readonly renders: DocumentRenderService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}
  @Post("preview")
  @UseGuards(UserThrottlerGuard)
  // A live preview re-renders as the form is edited, so this is looser than issuing (20).
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(DocumentMultipart())
  @ApiOperation({ summary: "Render an unsaved document draft as a PDF" })
  @ApiDocumentDraftBody("DocumentPreviewRequest")
  @ApiPdfResponse(201, "Rendered PDF (private, no-store); nothing is persisted")
  @ApiFailureResponses({
    400: "Invalid draft, envelope or logo",
    402: "Template not available on the current plan",
    404: "Order not found",
    413: "Request above 6 MiB or logo above 5 MiB",
    429: "More than 30 previews a minute (RATE_LIMITED), or two previews are already rendering; retry shortly",
  })
  async preview(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res() res: Response,
  ) {
    const draft = documentPayload(previewSchema, body, file);
    await this.configs.assertTemplate(req.user.id, draft.config.templateId);
    const order = draft.orderId
      ? await this.orders.findOne({
          where: { id: draft.orderId, user_id: req.user.id },
          relations: ["recipient", "items"],
        })
      : sampleOrder(req.user.id);
    if (!order) throw ApiErrors.ORDER_NOT_FOUND(draft.orderId);
    const bytes = await this.renders.preview(req.user.id, draft, order, file);
    res.set({
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="preview.pdf"',
    });
    res.send(bytes);
  }
}
