import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from '../entities/audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'log-1', ...data })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create and save an audit log entry', async () => {
    const params = {
      userId: 'user-1',
      action: 'CREATE',
      entityType: 'order',
      entityId: 'order-1',
      newValues: { status: 'draft' },
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      requestId: 'req-123',
    };

    await service.log(params);

    expect(mockRepository.create).toHaveBeenCalledWith({
      user_id: 'user-1',
      action: 'CREATE',
      entity_type: 'order',
      entity_id: 'order-1',
      old_values: undefined,
      new_values: { status: 'draft' },
      ip_address: '127.0.0.1',
      user_agent: 'Test Agent',
      request_id: 'req-123',
    });
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should handle optional fields', async () => {
    await service.log({
      action: 'DELETE',
      entityType: 'product',
    });

    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: undefined,
        action: 'DELETE',
        entity_type: 'product',
        entity_id: undefined,
      }),
    );
  });

  it('should not throw on save failure', async () => {
    mockRepository.save.mockRejectedValue(new Error('DB error'));

    await expect(
      service.log({ action: 'CREATE', entityType: 'test' }),
    ).resolves.toBeUndefined();
  });
});
