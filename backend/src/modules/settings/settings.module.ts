import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SettingsController } from "./settings.controller";
import { ObjectStorageService } from "../../common/services/object-storage.service";

@Module({
  imports: [ConfigModule],
  controllers: [SettingsController],
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class SettingsModule {}
