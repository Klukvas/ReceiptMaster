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
  ParseUUIDPipe,
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
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { PaginatedSupplierResponse } from "../../common/dto/paginated-response.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { Supplier } from "./entities/supplier.entity";
import {
  IDEMPOTENCY_KEY_API_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  idempotencyKeyOf,
} from "../../common/idempotency/idempotent-create";
import { ApiFailureResponses } from "../../openapi/api-docs.decorators";

@ApiTags("suppliers")
@ApiBearerAuth("bearer")
@Controller("suppliers")
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: "Создать поставщика" })
  @ApiResponse({
    status: 201,
    description:
      "Поставщик успешно создан, or the stored 201 response replayed for a repeated Idempotency-Key (with X-Idempotency-Replayed: true)",
    type: Supplier,
  })
  @ApiFailureResponses({
    400: "Invalid body (HTTP_EXCEPTION) or Idempotency-Key (VALIDATION_ERROR)",
    422: "The Idempotency-Key was already used with a different body (IDEMPOTENCY_KEY_REUSED)",
  })
  @ApiHeader(IDEMPOTENCY_KEY_API_HEADER)
  async create(
    @Body() createSupplierDto: CreateSupplierDto,
    @Request() req: Pick<HttpRequest, "headers"> & { user: User },
    @Res({ passthrough: true }) res: Response,
  ): Promise<Supplier | Readonly<Record<string, unknown>>> {
    const idempotencyKey = idempotencyKeyOf(req.headers);
    if (idempotencyKey === undefined) {
      return this.suppliersService.create(createSupplierDto, req.user);
    }
    const result = await this.suppliersService.createWithIdempotencyKey(
      createSupplierDto,
      req.user,
      idempotencyKey,
    );
    if (result.replayed) res.setHeader(IDEMPOTENCY_REPLAYED_HEADER, "true");
    return result.data;
  }

  @Get()
  @ApiOperation({ summary: "Получить список поставщиков" })
  @ApiResponse({
    status: 200,
    description: "Список поставщиков получен",
    type: PaginatedSupplierResponse,
  })
  findAll(@Query() pagination: PaginationDto, @Request() req: { user: User }) {
    return this.suppliersService.findAll(pagination, req.user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить поставщика по ID" })
  @ApiResponse({ status: 200, description: "Поставщик найден", type: Supplier })
  @ApiResponse({ status: 404, description: "Поставщик не найден" })
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: { user: User },
  ) {
    return this.suppliersService.findOne(id, req.user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить поставщика" })
  @ApiResponse({
    status: 200,
    description: "Поставщик успешно обновлен",
    type: Supplier,
  })
  @ApiResponse({ status: 404, description: "Поставщик не найден" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @Request() req: { user: User },
  ) {
    return this.suppliersService.update(id, updateSupplierDto, req.user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Удалить поставщика" })
  @ApiResponse({ status: 200, description: "Поставщик успешно удален" })
  @ApiResponse({ status: 404, description: "Поставщик не найден" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: { user: User },
  ) {
    return this.suppliersService.remove(id, req.user);
  }
}
