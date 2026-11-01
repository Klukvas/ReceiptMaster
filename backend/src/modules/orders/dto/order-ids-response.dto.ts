import { ApiProperty } from "@nestjs/swagger";

export class OrderIdsResponse {
  @ApiProperty({
    type: [String],
    description: "Newest first; at most one batch (500) of ids",
  })
  ids: string[];

  @ApiProperty({
    description: "How many orders match in all, which may exceed ids.length",
  })
  total: number;
}
