import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./services/settings.service";
import { UserSettings } from "./entities/user-settings.entity";
import { LogoStorageService } from "../../common/services/logo-storage.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserSettings])
  ],
  controllers: [SettingsController],
  providers: [SettingsService, LogoStorageService],
  exports: [SettingsService, LogoStorageService],
})
export class SettingsModule {}
