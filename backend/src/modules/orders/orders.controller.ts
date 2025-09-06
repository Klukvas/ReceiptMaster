import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Headers,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from "@nestjs/swagger";
import { OrdersService, PaginatedResponse } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { OrderStatus } from "./entities/order.entity";
import { Order } from "./entities/order.entity";

@ApiTags("orders")
@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: "Create order" })
  @ApiResponse({ status: 201, description: "Order successfully created" })
  @ApiResponse({ status: 404, description: "Recipient or product not found" })
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Idempotency key to prevent order duplication",
    required: false,
  })
  create(
    @Body() createOrderDto: CreateOrderDto,
    @Headers("idempotency-key") _idempotencyKey?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ) {
    // TODO: Implement idempotency key validation
    return this.ordersService.create(createOrderDto);
  }

  @Get()
  @ApiOperation({ summary: "Get orders list" })
  @ApiResponse({ status: 200, description: "Orders list retrieved" })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "Pagination offset",
  })
  @ApiQuery({ name: "limit", required: false, description: "Items per page" })
  @ApiQuery({
    name: "status",
    required: false,
    description: "Filter by order status",
  })
  findAll(
    @Query() paginationDto: PaginationDto,
    @Query("status") status?: OrderStatus,
  ): Promise<PaginatedResponse<Order>> {
    return this.ordersService.findAll(paginationDto, status);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order by ID" })
  @ApiResponse({ status: 200, description: "Order found" })
  @ApiResponse({ status: 404, description: "Order not found" })
  findOne(@Param("id") id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(":id/confirm")
  @ApiOperation({ summary: "Confirm order" })
  @ApiResponse({ status: 200, description: "Order successfully confirmed" })
  @ApiResponse({ status: 400, description: "Cannot confirm order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  confirm(@Param("id") id: string) {
    return this.ordersService.confirm(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update order" })
  @ApiResponse({ status: 200, description: "Order successfully updated" })
  @ApiResponse({ status: 400, description: "Cannot update order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  update(@Param("id") id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Patch(":id/cancel")
  @ApiOperation({ summary: "Cancel order" })
  @ApiResponse({ status: 200, description: "Order successfully cancelled" })
  @ApiResponse({ status: 400, description: "Cannot cancel order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  cancel(@Param("id") id: string) {
    return this.ordersService.cancel(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete order" })
  @ApiResponse({ status: 200, description: "Order successfully deleted" })
  @ApiResponse({ status: 400, description: "Cannot delete order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  remove(@Param("id") id: string) {
    return this.ordersService.remove(id);
  }
}
