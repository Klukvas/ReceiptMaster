import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Logger,
  Headers,
  ForbiddenException,
} from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { TelegramUpdate } from "./interfaces/telegram.interface";

@Controller()
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);
  private readonly webhookSecret: string | undefined;

  constructor(private readonly telegramService: TelegramService) {
    this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  }

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
  async webhook(
    @Body() update: TelegramUpdate,
    @Headers("x-telegram-bot-api-secret-token") secretToken?: string,
  ) {
    try {
      // Verify webhook secret if configured
      if (this.webhookSecret) {
        if (!secretToken || secretToken !== this.webhookSecret) {
          this.logger.warn("Invalid webhook secret token received");
          throw new ForbiddenException("Invalid webhook secret");
        }
      }

      this.logger.log("Webhook received:", JSON.stringify(update, null, 2));

      // Обрабатываем webhook через TelegramService
      await this.telegramService.handleWebhook(update);

      return { ok: true };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error("Webhook error:", error);
      return { ok: false, error: error.message };
    }
  }
}
