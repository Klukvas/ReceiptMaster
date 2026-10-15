import { DocumentAsset } from "./entities/document-asset.entity";
import { DocumentPreset } from "./entities/document-preset.entity";
import { DocumentAssetsService } from "./services/document-assets.service";
import { DocumentConfigService } from "./services/document-config.service";
import { DocumentConfigController } from "./document-config.controller";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./services/settings.service";
import { UserSettings } from "./entities/user-settings.entity";
import { LogoStorageService } from "../../common/services/logo-storage.service";
import { SubscriptionModule } from "../subscription/subscription.module";
import { CacheModule } from "../../common/modules/cache.module";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserSettings, DocumentAsset, DocumentPreset]),
    SubscriptionModule,
    CacheModule,
  ],
  controllers: [SettingsController, DocumentConfigController],
  providers: [
    SettingsService,
    LogoStorageService,
    DocumentAssetsService,
    DocumentConfigService,
  ],
  exports: [
    SettingsService,
    LogoStorageService,
    DocumentAssetsService,
    DocumentConfigService,
  ],
})
export class SettingsModule {}
