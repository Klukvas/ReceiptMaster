import { ApiProperty } from "@nestjs/swagger";

const PROFIT_DESCRIPTION =
  "Profit from the purchase cost frozen on each order line. Lines with an unknown cost are excluded; null when no line in this group has a known cost.";

/** Present on every profit payload: how much of the period has an unknown cost. */
export class ProfitCompletenessDto {
  @ApiProperty({
    description:
      "Order lines excluded from profit because their cost is unknown",
  })
  unknown_cost_lines: number;

  @ApiProperty({
    description: "Turnover (line totals, in cents) of the excluded lines",
  })
  unknown_cost_turnover_cents: number;

  @ApiProperty({
    description: "True when every line in this group has a known cost",
  })
  profit_complete: boolean;
}

export class DailyRevenueDto extends ProfitCompletenessDto {
  @ApiProperty()
  date: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: `${PROFIT_DESCRIPTION} A day without confirmed orders is 0.`,
  })
  revenue_cents: number | null;

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

export class RevenueByProductDto extends ProfitCompletenessDto {
  @ApiProperty()
  product_id: string;

  @ApiProperty()
  product_name: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: PROFIT_DESCRIPTION,
  })
  total_revenue_cents: number | null;

  @ApiProperty()
  total_quantity: number;

  @ApiProperty()
  currency: string;
}

export class RevenueByRecipientDto extends ProfitCompletenessDto {
  @ApiProperty()
  recipient_id: string;

  @ApiProperty()
  recipient_name: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: PROFIT_DESCRIPTION,
  })
  total_revenue_cents: number | null;

  @ApiProperty()
  total_orders: number;

  @ApiProperty()
  currency: string;
}

export class TotalRevenueDto extends ProfitCompletenessDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: PROFIT_DESCRIPTION,
  })
  total_revenue_cents: number | null;

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
