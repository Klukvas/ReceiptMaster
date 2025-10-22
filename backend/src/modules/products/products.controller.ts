import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  // ApiBearerAuth,
} from "@nestjs/swagger";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";

@ApiTags("products")
@Controller("products")
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: "Создать товар" })
  @ApiResponse({ status: 201, description: "Товар успешно создан" })
  create(@Body() createProductDto: CreateProductDto, @Request() req: { user: User }) {
    return this.productsService.create(createProductDto, req.user);
  }

  @Get()
  @ApiOperation({ summary: "Получить список товаров" })
  @ApiResponse({ status: 200, description: "Список товаров получен" })
  findAll(@Query() pagination: PaginationDto, @Request() req: { user: User }) {
    return this.productsService.findAll(pagination, req.user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить товар по ID" })
  @ApiResponse({ status: 200, description: "Товар найден" })
  @ApiResponse({ status: 404, description: "Товар не найден" })
  findOne(@Param("id") id: string, @Request() req: { user: User }) {
    return this.productsService.findOne(id, req.user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить товар" })
  @ApiResponse({ status: 200, description: "Товар успешно обновлен" })
  @ApiResponse({ status: 404, description: "Товар не найден" })
  update(@Param("id") id: string, @Body() updateProductDto: UpdateProductDto, @Request() req: { user: User }) {
    return this.productsService.update(id, updateProductDto, req.user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Удалить товар" })
  @ApiResponse({ status: 200, description: "Товар успешно удален" })
  @ApiResponse({ status: 400, description: "Невозможно удалить товар" })
  @ApiResponse({ status: 404, description: "Товар не найден" })
  remove(@Param("id") id: string, @Request() req: { user: User }) {
    return this.productsService.remove(id, req.user);
  }
}
