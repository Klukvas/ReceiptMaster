import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SettingsController } from './settings.controller';

@Module({
  imports: [ConfigModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
