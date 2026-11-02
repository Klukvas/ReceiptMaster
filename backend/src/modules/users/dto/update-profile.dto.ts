import { IsEmail } from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";

export class UpdateProfileDto {
  @NormalizedEmail()
  @IsEmail()
  email: string;
}
