import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsInt, IsOptional, Min } from "class-validator";
import { CreateProductDto } from "./create-product.dto";

/**
 * Only the fields present in the body are written. Stock is a precondition
 * write: `quantity` and `expectedQuantity` must be sent together, and the update
 * applies only while the stored quantity still equals `expectedQuantity`.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    type: "integer",
    description:
      "Stock the client last saw. Required with quantity (and only with it); " +
      "a mismatch returns 409 PRODUCT_QUANTITY_CONFLICT",
    example: 50,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedQuantity?: number;
}
