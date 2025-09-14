import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { TelegramUpdate } from "./interfaces/telegram.interface";

@Controller()
export class TelegramController {
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
      console.log("Webhook received:", JSON.stringify(update, null, 2));

      // Обрабатываем webhook через TelegramService
      await this.telegramService.handleWebhook(update);

      return { ok: true };
    } catch (error) {
      console.error("Webhook error:", error);
      return { ok: false, error: error.message };
    }
  }
}
