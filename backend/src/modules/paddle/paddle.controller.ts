import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Headers,
  Req,
  BadRequestException,
  Logger,
  RawBodyRequest,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiExcludeEndpoint } from "@nestjs/swagger";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { type EventEntity } from "@paddle/paddle-node-sdk";
import { PaddleService } from "./paddle.service";

@ApiTags("paddle")
@Controller()
export class PaddleController {
  private readonly logger = new Logger(PaddleController.name);

  constructor(private readonly paddleService: PaddleService) {}

  /** C1: Rate-limited. C2: Signature failure (400) separated from processing failure (500). */
  @Post("paddle/webhook")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("paddle-signature") signature?: string,
  ) {
    if (!signature) {
      throw new BadRequestException("Missing Paddle-Signature header");
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException("Missing raw body");
    }

    // Step 1: Verify signature — 400 on failure (don't retry)
    let event: EventEntity;
    try {
      event = await this.paddleService.verifyWebhook(
        rawBody.toString(),
        signature,
      );
    } catch (error) {
      this.logger.warn("Webhook signature verification failed", error);
      throw new BadRequestException("Invalid webhook signature");
    }

    // Step 2: Process event — unhandled errors become 500 (Paddle retries)
    await this.paddleService.handleWebhookEvent(event);

    return { ok: true };
  }
}
