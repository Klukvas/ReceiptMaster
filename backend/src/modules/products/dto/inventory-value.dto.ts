import { ApiProperty } from "@nestjs/swagger";
import { Currency } from "../entities/product.entity";

/** Aggregate worth of everything currently in stock, for one user. */
export class InventoryValueDto {
  @ApiProperty({ enum: Currency })
  currency: Currency;

  @ApiProperty({
    description: "Stock value at purchase (cost) price, in cents",
  })
  purchaseValueCents: number;

  @ApiProperty({
    description: "Stock value at sale (retail) price, in cents",
  })
  saleValueCents: number;

  @ApiProperty({ description: "Total units in stock across all products" })
  totalUnits: number;

  @ApiProperty({ description: "Number of (non-deleted) products in stock" })
  productCount: number;
}
