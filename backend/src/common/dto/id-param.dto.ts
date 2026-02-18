import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class IdParamDto {
  @ApiProperty({
    description: "Entity UUID",
    example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  })
  @IsUUID()
  id: string;
}
