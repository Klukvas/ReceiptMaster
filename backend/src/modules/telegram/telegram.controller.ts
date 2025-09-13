import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  Get,
  Query,
} from '@nestjs/common';

import { CreateTelegramOrderDto } from './dto/telegram-order.dto';
import { TelegramUpdateDto } from './dto/telegram-update.dto';
import { TelegramService } from './telegram.service';

@Controller()
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // Стандартный Telegram webhook endpoint
  @Post('tg/webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() update: any) {
    try {
      console.log('Webhook received:', JSON.stringify(update, null, 2));
      // await this.telegramService.handleWebhook(update);
      return { ok: true };
    } catch (error) {
      console.error('Webhook error:', error);
      return { ok: false, error: error.message };
    }
  }

  // Endpoint для проверки webhook (Telegram требует GET endpoint)
  @Get('tg/webhook')
  async getWebhook(@Query('token') token?: string) {
    return { status: 'ok', message: 'Webhook is working' };
  }

  // Endpoint для ручного создания заказа (для тестирования)
  @Post('tg/order')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() createTelegramOrderDto: CreateTelegramOrderDto) {
    try {
      const order = await this.telegramService.createOrderFromTelegram(createTelegramOrderDto);
      return {
        success: true,
        data: {
          orderId: order.id,
          message: 'Заказ успешно создан',
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException({
        success: false,
        message: 'Не удалось создать заказ, попробуйте ещё раз',
        error: error.message,
      });
    }
  }
}
