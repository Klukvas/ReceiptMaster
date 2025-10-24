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
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { RecipientsService } from "./recipients.service";
import { CreateRecipientDto } from "./dto/create-recipient.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";

@ApiTags("recipients")
@Controller("recipients")
@UseGuards(JwtAuthGuard)
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @Post()
  @ApiOperation({ summary: "Создать получателя" })
  @ApiResponse({ status: 201, description: "Получатель успешно создан" })
  create(
    @Body() createRecipientDto: CreateRecipientDto,
    @Request() req: { user: User },
  ) {
    return this.recipientsService.create(createRecipientDto, req.user);
  }

  @Get()
  @ApiOperation({ summary: "Получить список получателей" })
  @ApiResponse({ status: 200, description: "Список получателей получен" })
  findAll(@Query() pagination: PaginationDto, @Request() req: { user: User }) {
    return this.recipientsService.findAll(pagination, req.user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить получателя по ID" })
  @ApiResponse({ status: 200, description: "Получатель найден" })
  @ApiResponse({ status: 404, description: "Получатель не найден" })
  findOne(@Param("id") id: string, @Request() req: { user: User }) {
    return this.recipientsService.findOne(id, req.user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить получателя" })
  @ApiResponse({ status: 200, description: "Получатель успешно обновлен" })
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
    status: 400,
    description: "Нельзя удалить получателя с существующими заказами",
  })
  remove(@Param("id") id: string, @Request() req: { user: User }) {
    return this.recipientsService.remove(id, req.user);
  }
}
