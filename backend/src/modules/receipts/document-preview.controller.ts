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
import { z } from "zod";
import { Response } from "express";
import { Order } from "../orders/entities/order.entity";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { DocumentConfigService } from "../settings/services/document-config.service";
import { draftSchema } from "../settings/document-config";
import {
  DocumentMultipart,
  documentPayload,
} from "../settings/document-multipart";
import {
  DocumentRenderService,
  sampleOrder,
} from "./services/document-render.service";
import { ApiErrors } from "../../common/errors/ApiError";
const previewSchema = draftSchema
  .extend({ orderId: z.string().uuid().optional() })
  .strict();
@Controller("receipts")
@UseGuards(JwtAuthGuard)
export class DocumentPreviewController {
  constructor(
    private readonly configs: DocumentConfigService,
    private readonly renders: DocumentRenderService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}
  @Post("preview")
  @UseInterceptors(DocumentMultipart())
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
