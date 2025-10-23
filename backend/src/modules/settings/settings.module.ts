import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SettingsController } from "./settings.controller";
import { LogoStorageService } from "../../common/services/logo-storage.service";

@Module({
  imports: [ConfigModule],
  controllers: [SettingsController],
  providers: [LogoStorageService],
  exports: [LogoStorageService],
})
export class SettingsModule {}
