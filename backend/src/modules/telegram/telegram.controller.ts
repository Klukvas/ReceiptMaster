import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Logger,
} from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { TelegramUpdate } from "./interfaces/telegram.interface";

@Controller()
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

  // Стандартный Telegram webhook endpoint
  @Post("tg/webhook")
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: false, // Allow extra properties
      forbidNonWhitelisted: false, // Don't reject extra properties
    }),
  )
  async webhook(@Body() update: TelegramUpdate) {
    try {
      this.logger.log("Webhook received:", JSON.stringify(update, null, 2));

      // Обрабатываем webhook через TelegramService
      await this.telegramService.handleWebhook(update);

      return { ok: true };
    } catch (error) {
      this.logger.error("Webhook error:", error);
      return { ok: false, error: error.message };
    }
  }
}
