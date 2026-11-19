import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CreemController } from "./creem.controller";
import { CreemService } from "./creem.service";
import { CreemClient } from "./creem.client";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";

@Module({
  imports: [TypeOrmModule.forFeature([UserSubscription])],
  controllers: [CreemController],
  providers: [CreemService, CreemClient],
  exports: [CreemService],
})
export class CreemModule {}
