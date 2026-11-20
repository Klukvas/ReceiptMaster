import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Headers,
  Req,
  RawBodyRequest,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiExcludeEndpoint, ApiOperation } from "@nestjs/swagger";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { ApiErrors } from "../../common/errors/ApiError";
import { CreemService } from "./creem.service";
import { ApiDataResponse } from "../../openapi/api-docs.decorators";

@ApiTags("billing")
@Controller()
export class CreemController {
  constructor(private readonly creemService: CreemService) {}

  @Get("billing/config")
  @ApiOperation({ summary: "Public billing capability flag (no auth)" })
  @ApiDataResponse(200, "BillingConfigResponse", "Whether billing is enabled")
  getBillingConfig(): { billingEnabled: boolean } {
    return { billingEnabled: this.creemService.isBillingEnabled() };
  }

  /**
   * Outside the API prefix, so Creem's signature covers the body it sent. A rejected
   * signature or payload answers 400; a processing failure answers 500 and Creem retries.
   */
  @Post("creem/webhook")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("creem-signature") signature?: string,
  ) {
    this.creemService.assertBillingEnabled();
    if (!signature || !req.rawBody) {
      throw ApiErrors.WEBHOOK_SIGNATURE_INVALID();
    }

    const event = this.creemService.verifyWebhook(
      req.rawBody.toString(),
      signature,
    );
    await this.creemService.handleWebhookEvent(event);

    return { ok: true };
  }
}
