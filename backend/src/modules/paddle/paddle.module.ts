import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaddleController } from "./paddle.controller";
import { PaddleService } from "./paddle.service";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";

@Module({
  imports: [TypeOrmModule.forFeature([UserSubscription])],
  controllers: [PaddleController],
  providers: [PaddleService],
  exports: [PaddleService],
})
export class PaddleModule {}
