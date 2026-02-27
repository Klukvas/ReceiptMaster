import { LogoStorageService } from './logo-storage.service';

// Mock aws-sdk
jest.mock('aws-sdk', () => {
  const mockS3 = {
    upload: jest.fn().mockReturnThis(),
    getObject: jest.fn().mockReturnThis(),
    deleteObject: jest.fn().mockReturnThis(),
    headObject: jest.fn().mockReturnThis(),
    promise: jest.fn(),
  };
  return {
    S3: jest.fn(() => mockS3),
  };
});

describe('LogoStorageService', () => {
  let service: LogoStorageService;
  let configService: any;
  let s3Mock: any;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          S3_ENDPOINT: 'https://s3.example.com',
          AWS_REGION: 'us-east-1',
          AWS_ACCESS_KEY_ID: 'test-key',
          AWS_SECRET_ACCESS_KEY: 'test-secret',
          LOGOS_BUCKET: 'logos-bucket',
        };
        return config[key];
      }),
    };

    service = new LogoStorageService(configService);
    s3Mock = (service as any).s3;
  });

  describe('getBucketForFolder', () => {
    it('should return logos bucket for logos folder', () => {
      const result = (service as any).getBucketForFolder('logos');
      expect(result).toBe('logos-bucket');
    });

    it('should return null for unknown folder', () => {
      const result = (service as any).getBucketForFolder('unknown');
      expect(result).toBeNull();
    });
  });

  describe('uploadLogo', () => {
    it('should upload logo with correct key', async () => {
      s3Mock.upload.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Location: 'https://s3.example.com/logos-bucket/logos/logo-user-1.png',
        }),
      });

      const result = await service.uploadLogo(
        Buffer.from('image-data'),
        'user-1',
      );

      expect(result).toContain('logos-bucket');
    });
  });

  describe('downloadLogo', () => {
    it('should download logo', async () => {
      s3Mock.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('image-data'),
        }),
      });

      const result = await service.downloadLogo('user-1');

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should rethrow on error', async () => {
      s3Mock.getObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Not found')),
      });

      await expect(service.downloadLogo('user-1')).rejects.toThrow(
        'Not found',
      );
    });
  });

  describe('userHasLogo', () => {
    it('should return true when logo exists', async () => {
      s3Mock.headObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = await service.userHasLogo('user-1');

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      s3Mock.headObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('S3 error')),
      });

      const result = await service.userHasLogo('user-1');

      expect(result).toBe(false);
    });
  });

  describe('deleteUserLogo', () => {
    it('should delete logo', async () => {
      s3Mock.deleteObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      await service.deleteUserLogo('user-1');

      expect(s3Mock.deleteObject).toHaveBeenCalled();
    });

    it('should throw if bucket not configured', async () => {
      (service as any).bucket = undefined;

      await expect(service.deleteUserLogo('user-1')).rejects.toThrow(
        'LOGOS_BUCKET is not configured',
      );
    });

    it('should rethrow on S3 error', async () => {
      s3Mock.deleteObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(
          Object.assign(new Error('Access denied'), {
            code: 'AccessDenied',
            statusCode: 403,
          }),
        ),
      });

      await expect(service.deleteUserLogo('user-1')).rejects.toThrow(
        'Access denied',
      );
    });
  });

  describe('getLogoUrl', () => {
    it('should return correct URL', () => {
      const url = service.getLogoUrl('user-1');

      expect(url).toBe(
        'https://s3.example.com/logos-bucket/logos/logo-user-1.png',
      );
    });
  });
});
