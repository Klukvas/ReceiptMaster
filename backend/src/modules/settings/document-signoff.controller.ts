import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Put,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserThrottlerGuard } from "../../common/guards/user-throttler.guard";
import { Response } from "express";
import { ApiErrors } from "../../common/errors/ApiError";
import {
  SIGNOFF_LIMITS,
  SignoffKind,
} from "../../common/services/signoff-image";
import {
  ApiDataResponse,
  ApiFailureResponses,
  ApiSignoffUploadBody,
} from "../../openapi/api-docs.decorators";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { DocumentSignoffService } from "./services/document-signoff.service";

const SIGNOFF_KIND = { signature: "signature", stamp: "stamp" } as const;
const KIND_PIPE = new ParseEnumPipe(SIGNOFF_KIND);

@ApiTags("settings")
@ApiBearerAuth("bearer")
@Controller("settings/signoff")
@UseGuards(JwtAuthGuard)
export class DocumentSignoffController {
  constructor(private readonly signoff: DocumentSignoffService) {}

  @Get()
  @ApiOperation({ summary: "The account's current signature and stamp images" })
  @ApiDataResponse(200, "SignoffState", "Image metadata, null where unset")
  get(@Request() req: { user: User }) {
    return this.signoff.get(req.user.id);
  }

  @Get(":kind/image")
  @ApiOperation({ summary: "The stored signature or stamp as a PNG" })
  @ApiResponse({
    status: 200,
    description: "PNG image",
    content: {
      "image/png": { schema: { type: "string", format: "binary" } },
    },
  })
  @ApiFailureResponses({
    400: "Unknown kind (not signature or stamp)",
    404: "No image of this kind is set",
  })
  async image(
    @Param("kind", KIND_PIPE) kind: SignoffKind,
    @Request() req: { user: User },
    @Res() res: Response,
  ) {
    const png = await this.signoff.image(req.user.id, kind);
    res
      .set({
        "Content-Type": "image/png",
        "Content-Length": png.length.toString(),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(png);
  }

  @Put(":kind")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: SIGNOFF_LIMITS.maxUploadBytes,
        files: 1,
        fields: 0,
        // One file plus the part that trips the limit; multer's parts limit is exclusive.
        parts: 2,
      },
    }),
  )
  @ApiOperation({ summary: "Replace the signature or stamp image" })
  @ApiSignoffUploadBody()
  @ApiDataResponse(200, "SignoffImage", "The new image")
  @ApiFailureResponses({
    400: "Unknown kind, not a PNG or JPEG, signature bytes do not match, size outside 32 to 4096 px, or animated (VALIDATION_ERROR, field signature or stamp)",
    413: "File above 2 MiB",
    429: "More than 10 uploads a minute (RATE_LIMITED)",
  })
  replace(
    @Param("kind", KIND_PIPE) kind: SignoffKind,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: { user: User },
  ) {
    if (!file) throw ApiErrors.REQUIRED_FIELD_MISSING("file");
    return this.signoff.replace(req.user.id, kind, file);
  }

  @Delete(":kind")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove the signature or stamp image (idempotent)" })
  @ApiResponse({ status: 204, description: "Removed or already absent" })
  @ApiFailureResponses({ 400: "Unknown kind (not signature or stamp)" })
  async remove(
    @Param("kind", KIND_PIPE) kind: SignoffKind,
    @Request() req: { user: User },
  ): Promise<void> {
    await this.signoff.remove(req.user.id, kind);
  }
}
