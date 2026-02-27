import { ForbiddenException } from '@nestjs/common';
import { TelegramController } from './telegram.controller';

describe('TelegramController', () => {
  let controller: TelegramController;
  let telegramService: any;

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };

    telegramService = {
      handleWebhook: jest.fn().mockResolvedValue(undefined),
    };

    controller = new TelegramController(telegramService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('webhook', () => {
    it('should process update and return ok', async () => {
      const update = { update_id: 1, message: { text: '/start' } };

      const result = await controller.webhook(update as any);

      expect(result).toEqual({ ok: true });
      expect(telegramService.handleWebhook).toHaveBeenCalledWith(update);
    });

    it('should return error on service failure', async () => {
      telegramService.handleWebhook.mockRejectedValue(
        new Error('Service error'),
      );

      const result = await controller.webhook({ update_id: 1 } as any);

      expect(result).toEqual({ ok: false, error: 'Service error' });
    });

    it('should verify webhook secret when configured', async () => {
      process.env.TELEGRAM_WEBHOOK_SECRET = 'my-secret';
      controller = new TelegramController(telegramService);

      const result = await controller.webhook(
        { update_id: 1 } as any,
        'my-secret',
      );

      expect(result).toEqual({ ok: true });
    });

    it('should throw ForbiddenException for invalid secret', async () => {
      process.env.TELEGRAM_WEBHOOK_SECRET = 'my-secret';
      controller = new TelegramController(telegramService);

      await expect(
        controller.webhook({ update_id: 1 } as any, 'wrong-secret'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when secret missing', async () => {
      process.env.TELEGRAM_WEBHOOK_SECRET = 'my-secret';
      controller = new TelegramController(telegramService);

      await expect(
        controller.webhook({ update_id: 1 } as any, undefined),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should skip secret check when no secret configured', async () => {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      controller = new TelegramController(telegramService);

      const result = await controller.webhook({ update_id: 1 } as any);

      expect(result).toEqual({ ok: true });
    });
  });
});
