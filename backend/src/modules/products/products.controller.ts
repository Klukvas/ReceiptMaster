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

@ApiTags("products")
@Controller("products")
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: "Создать товар" })
  @ApiResponse({ status: 201, description: "Товар успешно создан" })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: "Получить список товаров" })
  @ApiResponse({ status: 200, description: "Список товаров получен" })
  findAll(@Query() pagination: PaginationDto) {
    return this.productsService.findAll(pagination);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить товар по ID" })
  @ApiResponse({ status: 200, description: "Товар найден" })
  @ApiResponse({ status: 404, description: "Товар не найден" })
  findOne(@Param("id") id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить товар" })
  @ApiResponse({ status: 200, description: "Товар успешно обновлен" })
  @ApiResponse({ status: 404, description: "Товар не найден" })
  update(@Param("id") id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Удалить товар" })
  @ApiResponse({ status: 200, description: "Товар успешно удален" })
  @ApiResponse({ status: 400, description: "Невозможно удалить товар" })
  @ApiResponse({ status: 404, description: "Товар не найден" })
  remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }
}
