import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Delete,
  UseGuards,
  Request,
  Res,
} from "@nestjs/common";
import { Request as HttpRequest, Response } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from "@nestjs/swagger";
import { RecipientsService } from "./recipients.service";
import { CreateRecipientDto } from "./dto/create-recipient.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { PaginatedRecipientResponse } from "../../common/dto/paginated-response.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { Recipient } from "./entities/recipient.entity";
import { ApiFailureResponses } from "../../openapi/api-docs.decorators";
import {
  IDEMPOTENCY_KEY_API_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  idempotencyKeyOf,
} from "../../common/idempotency/idempotent-create";

@ApiTags("recipients")
@ApiBearerAuth("bearer")
@Controller("recipients")
@UseGuards(JwtAuthGuard)
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @Post()
  @ApiOperation({ summary: "Создать получателя" })
  @ApiResponse({
    status: 201,
    description:
      "Получатель успешно создан, or the stored 201 response replayed for a repeated Idempotency-Key (with X-Idempotency-Replayed: true)",
    type: Recipient,
  })
  @ApiFailureResponses({
    400: "Invalid body (HTTP_EXCEPTION) or Idempotency-Key (VALIDATION_ERROR)",
  })
  @ApiHeader(IDEMPOTENCY_KEY_API_HEADER)
  async create(
    @Body() createRecipientDto: CreateRecipientDto,
    @Request() req: Pick<HttpRequest, "headers"> & { user: User },
    @Res({ passthrough: true }) res: Response,
  ): Promise<Recipient | Readonly<Record<string, unknown>>> {
    const idempotencyKey = idempotencyKeyOf(req.headers);
    if (idempotencyKey === undefined) {
      return this.recipientsService.create(createRecipientDto, req.user);
    }
    const result = await this.recipientsService.createWithIdempotencyKey(
      createRecipientDto,
      req.user,
      idempotencyKey,
    );
    if (result.replayed) res.setHeader(IDEMPOTENCY_REPLAYED_HEADER, "true");
    return result.data;
  }

  @Get()
  @ApiOperation({ summary: "Получить список получателей" })
  @ApiResponse({
    status: 200,
    description: "Список получателей получен",
    type: PaginatedRecipientResponse,
  })
  findAll(@Query() pagination: PaginationDto, @Request() req: { user: User }) {
    return this.recipientsService.findAll(pagination, req.user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить получателя по ID" })
  @ApiResponse({
    status: 200,
    description: "Получатель найден",
    type: Recipient,
  })
  @ApiResponse({ status: 404, description: "Получатель не найден" })
  findOne(@Param("id") id: string, @Request() req: { user: User }) {
    return this.recipientsService.findOne(id, req.user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить получателя" })
  @ApiResponse({
    status: 200,
    description: "Получатель успешно обновлен",
    type: Recipient,
  })
  @ApiFailureResponses({
    400: "name sent as null (VALIDATION_ERROR), or an invalid body (HTTP_EXCEPTION)",
  })
  @ApiResponse({ status: 404, description: "Получатель не найден" })
  update(
    @Param("id") id: string,
    @Body() updateRecipientDto: UpdateRecipientDto,
    @Request() req: { user: User },
  ) {
    return this.recipientsService.update(id, updateRecipientDto, req.user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Удалить получателя" })
  @ApiResponse({ status: 200, description: "Получатель успешно удален" })
  @ApiResponse({ status: 404, description: "Получатель не найден" })
  @ApiResponse({
    status: 409,
    description: "Нельзя удалить получателя с заказами, включая удалённые",
  })
  remove(@Param("id") id: string, @Request() req: { user: User }) {
    return this.recipientsService.remove(id, req.user);
  }
}
