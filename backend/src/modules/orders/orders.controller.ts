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
  Request,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from "@nestjs/swagger";
import { OrdersService, PaginatedResponse, IdempotencyResponse } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { OrderStatus } from "./entities/order.entity";
import { Order } from "./entities/order.entity";
import { User } from "../users/entities/user.entity";

@ApiTags("orders")
@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: "Create order" })
  @ApiResponse({ status: 201, description: "Order successfully created" })
  @ApiResponse({ status: 200, description: "Order returned from idempotency cache" })
  @ApiResponse({ status: 404, description: "Recipient or product not found" })
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Idempotency key to prevent order duplication (valid for 24 hours)",
    required: false,
  })
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Request() req: { user: User },
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res() res: Response,
  ): Promise<Response> {
    const result: IdempotencyResponse = await this.ordersService.create(
      createOrderDto,
      req.user,
      idempotencyKey,
    );

    // Set header to indicate if response was from cache
    if (result.isFromCache) {
      res.setHeader("X-Idempotency-Replayed", "true");
    }

    return res.status(result.statusCode).json(result.data);
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
    @Request() req: { user: User },
    @Query("status") status?: OrderStatus,
  ): Promise<PaginatedResponse<Order>> {
    return this.ordersService.findAll(paginationDto, req.user, status);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order by ID" })
  @ApiResponse({ status: 200, description: "Order found" })
  @ApiResponse({ status: 404, description: "Order not found" })
  findOne(@Param("id") id: string, @Request() req: { user: User }) {
    return this.ordersService.findOne(id, req.user);
  }

  @Patch(":id/confirm")
  @ApiOperation({ summary: "Confirm order" })
  @ApiResponse({ status: 200, description: "Order successfully confirmed" })
  @ApiResponse({ status: 400, description: "Cannot confirm order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  confirm(@Param("id") id: string, @Request() req: { user: User }) {
    return this.ordersService.confirm(id, req.user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update order" })
  @ApiResponse({ status: 200, description: "Order successfully updated" })
  @ApiResponse({ status: 400, description: "Cannot update order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  update(
    @Param("id") id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req: { user: User },
  ) {
    return this.ordersService.update(id, updateOrderDto, req.user);
  }

  @Patch(":id/cancel")
  @ApiOperation({ summary: "Cancel order" })
  @ApiResponse({ status: 200, description: "Order successfully cancelled" })
  @ApiResponse({ status: 400, description: "Cannot cancel order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  cancel(@Param("id") id: string, @Request() req: { user: User }) {
    return this.ordersService.cancel(id, req.user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete order" })
  @ApiResponse({ status: 200, description: "Order successfully deleted" })
  @ApiResponse({ status: 400, description: "Cannot delete order" })
  @ApiResponse({ status: 404, description: "Order not found" })
  remove(@Param("id") id: string, @Request() req: { user: User }) {
    return this.ordersService.remove(id, req.user);
  }

  @Get("dashboard/revenue-by-products")
  @ApiOperation({ summary: "Get revenue by products" })
  @ApiResponse({ status: 200, description: "Revenue by products retrieved" })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date for filtering (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date for filtering (ISO string)",
  })
  getRevenueByProducts(
    @Request() req: { user: User },
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.ordersService.getRevenueByProducts(req.user, start, end);
  }

  @Get("dashboard/revenue-by-recipients")
  @ApiOperation({ summary: "Get revenue by recipients" })
  @ApiResponse({ status: 200, description: "Revenue by recipients retrieved" })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date for filtering (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date for filtering (ISO string)",
  })
  getRevenueByRecipients(
    @Request() req: { user: User },
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.ordersService.getRevenueByRecipients(req.user, start, end);
  }

  @Get("dashboard/total-revenue")
  @ApiOperation({ summary: "Get total revenue" })
  @ApiResponse({ status: 200, description: "Total revenue retrieved" })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date for filtering (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date for filtering (ISO string)",
  })
  getTotalRevenue(
    @Request() req: { user: User },
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.ordersService.getTotalRevenue(req.user, start, end);
  }

  // Endpoints для общего оборота
  @Get("dashboard/turnover-by-products")
  @ApiOperation({ summary: "Get turnover by products" })
  @ApiResponse({ status: 200, description: "Turnover by products retrieved" })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date for filtering (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date for filtering (ISO string)",
  })
  getTurnoverByProducts(
    @Request() req: { user: User },
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.ordersService.getTurnoverByProducts(req.user, start, end);
  }

  @Get("dashboard/turnover-by-recipients")
  @ApiOperation({ summary: "Get turnover by recipients" })
  @ApiResponse({ status: 200, description: "Turnover by recipients retrieved" })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date for filtering (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date for filtering (ISO string)",
  })
  getTurnoverByRecipients(
    @Request() req: { user: User },
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.ordersService.getTurnoverByRecipients(req.user, start, end);
  }

  @Get("dashboard/total-turnover")
  @ApiOperation({ summary: "Get total turnover" })
  @ApiResponse({ status: 200, description: "Total turnover retrieved" })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date for filtering (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date for filtering (ISO string)",
  })
  getTotalTurnover(
    @Request() req: { user: User },
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.ordersService.getTotalTurnover(req.user, start, end);
  }
}
