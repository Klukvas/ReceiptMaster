import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiErrors } from "../../common/errors/ApiError";
import {
  ApiDataResponse,
  ApiFailureResponses,
  ApiJsonBody,
} from "../../openapi/api-docs.decorators";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { DocumentNumberingService } from "./document-numbering.service";
import { parseUpdateNumbering } from "./dto/update-numbering.dto";
import { DocumentType } from "./entities/receipt.entity";

function parseType(value: string): DocumentType {
  if (!(Object.values(DocumentType) as string[]).includes(value))
    throw ApiErrors.VALIDATION_ERROR(
      "type",
      `type must be one of: ${Object.values(DocumentType).join(", ")}`,
    );
  return value as DocumentType;
}

// Lives with the receipts module: the counters are its tables and settings cannot import it.
@ApiTags("settings")
@ApiBearerAuth("bearer")
@Controller("settings/document-numbering")
@UseGuards(JwtAuthGuard)
export class DocumentNumberingController {
  constructor(private readonly numbering: DocumentNumberingService) {}

  @Get()
  @ApiOperation({
    summary: "Number format and next number for every document type",
  })
  @ApiDataResponse(200, "NumberingSettingsResponse", "All seven types")
  list(@Request() req: { user: User }) {
    return this.numbering.list(req.user.id);
  }

  @Put(":type")
  @ApiOperation({
    summary:
      "Set the number format of one document type, optionally raising the counter",
  })
  @ApiJsonBody("NumberingUpdateRequest")
  @ApiDataResponse(200, "NumberingSetting", "Saved setting")
  @ApiFailureResponses({
    400: "Invalid prefix, padding, startNumber or resetEveryYear (VALIDATION_ERROR names the field; resetEveryYear needs includeYear)",
    409: "startNumber is below a number already used (NUMBERING_START_TOO_LOW); `minStart` is the lowest allowed (of the current year while the yearly reset is on)",
  })
  update(
    @Param("type") type: string,
    @Body() body: unknown,
    @Request() req: { user: User },
  ) {
    return this.numbering.update(
      req.user.id,
      parseType(type),
      parseUpdateNumbering(body),
    );
  }
}
