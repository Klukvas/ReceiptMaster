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
  ApiBearerAuth,
} from "@nestjs/swagger";
import { OrdersService, IdempotencyResponse } from "./orders.service";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { BatchOrderIdsDto } from "./dto/batch-orders.dto";
import { JwtAuthGuard } from "../../modules/users/guards/jwt-auth.guard";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { DateRangeDto } from "../../common/dto/date-range.dto";
import { OrderStatus } from "./entities/order.entity";
import { Order } from "./entities/order.entity";
import { User } from "../users/entities/user.entity";

@ApiTags("orders")
@ApiBearerAuth("bearer")
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

  @Post("batch-approve")
  @ApiOperation({ summary: "Batch approve orders" })
  @ApiResponse({ status: 200, description: "Orders approved" })
  @ApiResponse({ status: 400, description: "Some orders cannot be approved" })
  async batchApprove(
    @Body() dto: BatchOrderIdsDto,
    @Request() req: { user: User },
  ): Promise<{ approved: number }> {
    return this.ordersService.approveBatch(dto.orderIds, req.user);
  }

  @Post("batch-delete")
  @ApiOperation({ summary: "Batch delete orders" })
  @ApiResponse({ status: 200, description: "Orders deleted" })
  @ApiResponse({ status: 400, description: "Some orders cannot be deleted" })
  async batchDelete(
    @Body() dto: BatchOrderIdsDto,
    @Request() req: { user: User },
  ): Promise<{ deleted: number }> {
    return this.ordersService.deleteBatch(dto.orderIds, req.user);
  }

  @Get()
  @ApiOperation({ summary: "Get orders list" })
  @ApiResponse({ status: 200, description: "Orders list retrieved" })
  @ApiQuery({ name: "status", required: false, description: "Filter by order status" })
  @ApiQuery({ name: "minAmount", required: false, description: "Minimum order total in cents" })
  @ApiQuery({ name: "maxAmount", required: false, description: "Maximum order total in cents" })
  findAll(
    @Query() paginationDto: PaginationDto,
    @Query() dateRange: DateRangeDto,
    @Request() req: { user: User },
    @Query("status") status?: OrderStatus,
    @Query("minAmount") minAmount?: string,
    @Query("maxAmount") maxAmount?: string,
  ): Promise<PaginatedResponse<Order>> {
    const filters = {
      startDate: dateRange.startDateParsed,
      endDate: dateRange.endDateParsed,
      minAmount: minAmount ? parseInt(minAmount) : undefined,
      maxAmount: maxAmount ? parseInt(maxAmount) : undefined,
    };
    return this.ordersService.findAll(paginationDto, req.user, status, filters);
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

  @Get("dashboard/daily-revenue")
  @ApiOperation({ summary: "Get daily revenue/turnover for sparkline" })
  @ApiResponse({ status: 200, description: "Daily revenue data retrieved" })
  @ApiQuery({ name: "days", required: false, description: "Number of days (default 7)" })
  getDailyRevenue(
    @Request() req: { user: User },
    @Query("days") days?: string,
  ) {
    return this.ordersService.getDailyRevenue(req.user, days ? parseInt(days) : 7);
  }

  @Get("dashboard/status-summary")
  @ApiOperation({ summary: "Get order status summary (draft/confirmed/cancelled counts)" })
  @ApiResponse({ status: 200, description: "Order status summary retrieved" })
  getOrderStatusSummary(@Request() req: { user: User }) {
    return this.ordersService.getOrderStatusSummary(req.user);
  }

  @Get("dashboard/revenue-by-products")
  @ApiOperation({ summary: "Get revenue by products" })
  @ApiResponse({ status: 200, description: "Revenue by products retrieved" })
  getRevenueByProducts(
    @Request() req: { user: User },
    @Query() dateRange: DateRangeDto,
  ) {
    return this.ordersService.getRevenueByProducts(
      req.user,
      dateRange.startDateParsed,
      dateRange.endDateParsed,
    );
  }

  @Get("dashboard/revenue-by-recipients")
  @ApiOperation({ summary: "Get revenue by recipients" })
  @ApiResponse({ status: 200, description: "Revenue by recipients retrieved" })
  getRevenueByRecipients(
    @Request() req: { user: User },
    @Query() dateRange: DateRangeDto,
  ) {
    return this.ordersService.getRevenueByRecipients(
      req.user,
      dateRange.startDateParsed,
      dateRange.endDateParsed,
    );
  }

  @Get("dashboard/total-revenue")
  @ApiOperation({ summary: "Get total revenue" })
  @ApiResponse({ status: 200, description: "Total revenue retrieved" })
  getTotalRevenue(
    @Request() req: { user: User },
    @Query() dateRange: DateRangeDto,
  ) {
    return this.ordersService.getTotalRevenue(
      req.user,
      dateRange.startDateParsed,
      dateRange.endDateParsed,
    );
  }

  @Get("dashboard/turnover-by-products")
  @ApiOperation({ summary: "Get turnover by products" })
  @ApiResponse({ status: 200, description: "Turnover by products retrieved" })
  getTurnoverByProducts(
    @Request() req: { user: User },
    @Query() dateRange: DateRangeDto,
  ) {
    return this.ordersService.getTurnoverByProducts(
      req.user,
      dateRange.startDateParsed,
      dateRange.endDateParsed,
    );
  }

  @Get("dashboard/turnover-by-recipients")
  @ApiOperation({ summary: "Get turnover by recipients" })
  @ApiResponse({ status: 200, description: "Turnover by recipients retrieved" })
  getTurnoverByRecipients(
    @Request() req: { user: User },
    @Query() dateRange: DateRangeDto,
  ) {
    return this.ordersService.getTurnoverByRecipients(
      req.user,
      dateRange.startDateParsed,
      dateRange.endDateParsed,
    );
  }

  @Get("dashboard/total-turnover")
  @ApiOperation({ summary: "Get total turnover" })
  @ApiResponse({ status: 200, description: "Total turnover retrieved" })
  getTotalTurnover(
    @Request() req: { user: User },
    @Query() dateRange: DateRangeDto,
  ) {
    return this.ordersService.getTotalTurnover(
      req.user,
      dateRange.startDateParsed,
      dateRange.endDateParsed,
    );
  }
}
