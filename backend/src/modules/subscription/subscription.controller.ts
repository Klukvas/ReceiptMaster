import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { SubscriptionService } from "./subscription.service";

@ApiTags("subscription")
@ApiBearerAuth("bearer")
@Controller("subscription")
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get("status")
  async getStatus(@Request() req: { user: User }) {
    return this.subscriptionService.getStatus(req.user.id);
  }
}
