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
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { PaginatedSupplierResponse } from "../../common/dto/paginated-response.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { Supplier } from "./entities/supplier.entity";

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
    description: "Поставщик успешно создан",
    type: Supplier,
  })
  create(
    @Body() createSupplierDto: CreateSupplierDto,
    @Request() req: { user: User },
  ) {
    return this.suppliersService.create(createSupplierDto, req.user);
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
