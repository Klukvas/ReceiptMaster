import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from "@nestjs/swagger";
import { IsIn, IsString } from "class-validator";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { SubscriptionService } from "./subscription.service";
import { PaddleService } from "../paddle/paddle.service";

export class CheckoutDto {
  @IsString()
  @IsIn(["pro", "business"])
  plan: "pro" | "business";
}

@ApiTags("subscription")
@ApiBearerAuth("bearer")
@Controller("subscription")
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly paddleService: PaddleService,
  ) {}

  @Get("status")
  @ApiOperation({ summary: "Get current subscription status and usage" })
  async getStatus(@Request() req: { user: User }) {
    return this.subscriptionService.getStatus(req.user.id);
  }

  @Post("checkout")
  @ApiOperation({ summary: "Create Paddle checkout transaction" })
  @ApiBody({ type: CheckoutDto })
  async checkout(
    @Request() req: { user: User },
    @Body() dto: CheckoutDto,
  ) {
    return this.paddleService.createCheckoutTransaction(
      req.user.id,
      req.user.email,
      dto.plan,
    );
  }

  @Post("portal")
  @ApiOperation({ summary: "Get Paddle customer portal URL" })
  async portal(@Request() req: { user: User }) {
    return this.paddleService.createPortalSession(req.user.id);
  }
}
