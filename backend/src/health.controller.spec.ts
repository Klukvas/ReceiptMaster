import { HealthController } from './health.controller';
import { HttpStatus } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: any;
  let configService: any;
  let cacheService: any;

  const createMockRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    cacheService = {
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    controller = new HealthController(dataSource, configService, cacheService);
  });

  it('should return ok when all services are healthy', async () => {
    const res = createMockRes();

    await controller.check(res as any);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        db: 'ok',
        redis: 'ok',
      }),
    );
  });

  it('should return degraded when DB check fails', async () => {
    dataSource.query.mockRejectedValue(new Error('DB connection failed'));
    const res = createMockRes();

    await controller.check(res as any);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        db: 'error',
      }),
    );
  });

  it('should return degraded when Redis check fails', async () => {
    cacheService.isHealthy.mockResolvedValue(false);
    const res = createMockRes();

    await controller.check(res as any);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        redis: 'error',
      }),
    );
  });

  it('should report s3 as not_configured when no bucket set', async () => {
    configService.get.mockReturnValue(undefined);
    const res = createMockRes();

    await controller.check(res as any);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ s3: 'not_configured' }),
    );
  });

  it('should include uptime and timestamp', async () => {
    const res = createMockRes();

    await controller.check(res as any);

    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall).toHaveProperty('uptime');
    expect(jsonCall).toHaveProperty('timestamp');
    expect(jsonCall).toHaveProperty('responseTimeMs');
  });
});
