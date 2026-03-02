import { ApiProperty } from "@nestjs/swagger";

export class DailyRevenueDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  revenue_cents: number;

  @ApiProperty()
  turnover_cents: number;
}

export class OrderStatusSummaryDto {
  @ApiProperty()
  draft: number;

  @ApiProperty()
  confirmed: number;

  @ApiProperty()
  cancelled: number;
}

export class RevenueByProductDto {
  @ApiProperty()
  product_id: string;

  @ApiProperty()
  product_name: string;

  @ApiProperty()
  total_revenue_cents: number;

  @ApiProperty()
  total_quantity: number;

  @ApiProperty()
  currency: string;
}

export class RevenueByRecipientDto {
  @ApiProperty()
  recipient_id: string;

  @ApiProperty()
  recipient_name: string;

  @ApiProperty()
  total_revenue_cents: number;

  @ApiProperty()
  total_orders: number;

  @ApiProperty()
  currency: string;
}

export class TotalRevenueDto {
  @ApiProperty()
  total_revenue_cents: number;

  @ApiProperty()
  total_orders: number;

  @ApiProperty()
  currency: string;
}

export class TurnoverByProductDto {
  @ApiProperty()
  product_id: string;

  @ApiProperty()
  product_name: string;

  @ApiProperty()
  total_turnover_cents: number;

  @ApiProperty()
  total_quantity: number;

  @ApiProperty()
  currency: string;
}

export class TurnoverByRecipientDto {
  @ApiProperty()
  recipient_id: string;

  @ApiProperty()
  recipient_name: string;

  @ApiProperty()
  total_turnover_cents: number;

  @ApiProperty()
  total_orders: number;

  @ApiProperty()
  currency: string;
}

export class TotalTurnoverDto {
  @ApiProperty()
  total_turnover_cents: number;

  @ApiProperty()
  total_orders: number;

  @ApiProperty()
  currency: string;
}
