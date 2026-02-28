import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from "class-validator";

export class BatchOrderIdsDto {
  @ApiProperty({
    description: "Array of order UUIDs",
    example: ["123e4567-e89b-12d3-a456-426614174000"],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "At least one order ID is required" })
  @ArrayMaxSize(500, { message: "Maximum 500 orders per batch" })
  @IsUUID("4", { each: true })
  orderIds: string[];
}
