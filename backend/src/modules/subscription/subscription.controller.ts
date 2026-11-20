import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from "@nestjs/swagger";
import { IsIn, IsString } from "class-validator";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { SubscriptionService } from "./subscription.service";
import { CreemService } from "../creem/creem.service";

export class CheckoutDto {
  @IsString()
  @IsIn(["pro", "business"])
  plan: "pro" | "business";
}

export class ChangePlanDto {
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
    private readonly creemService: CreemService,
  ) {}

  @Get("status")
  @ApiOperation({ summary: "Get current subscription status and usage" })
  async getStatus(@Request() req: { user: User }) {
    return this.subscriptionService.getStatus(req.user.id);
  }

  @Post("checkout")
  @ApiOperation({ summary: "Create a hosted checkout and return its URL" })
  @ApiBody({ type: CheckoutDto })
  async checkout(@Request() req: { user: User }, @Body() dto: CheckoutDto) {
    return this.creemService.createCheckout(
      req.user.id,
      req.user.email,
      dto.plan,
    );
  }

  @Post("portal")
  @ApiOperation({ summary: "Get the customer billing portal URL" })
  async portal(@Request() req: { user: User }) {
    return this.creemService.createPortalSession(req.user.id);
  }

  @Post("change-plan")
  @HttpCode(200)
  @ApiOperation({
    summary: "Move the live subscription to another paid plan",
  })
  @ApiBody({ type: ChangePlanDto })
  async changePlan(@Request() req: { user: User }, @Body() dto: ChangePlanDto) {
    await this.creemService.changePlan(req.user.id, dto.plan);
    return this.subscriptionService.getStatus(req.user.id);
  }

  @Post("cancel")
  @HttpCode(200)
  @ApiOperation({
    summary: "Cancel the subscription at the end of the paid period",
  })
  async cancel(@Request() req: { user: User }) {
    await this.creemService.cancelSubscription(req.user.id);
    return this.subscriptionService.getStatus(req.user.id);
  }

  @Post("resume")
  @HttpCode(200)
  @ApiOperation({ summary: "Undo a cancellation that is still scheduled" })
  async resume(@Request() req: { user: User }) {
    await this.creemService.resumeSubscription(req.user.id);
    return this.subscriptionService.getStatus(req.user.id);
  }
}
