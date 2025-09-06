import { registerAs } from '@nestjs/config';
import { EnvConfig } from './env.schema';

export default registerAs('app', () => ({
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  apiKey: process.env.API_KEY,
  receiptStoragePath: process.env.RECEIPT_STORAGE_PATH || './receipts',
  receiptBaseUrl: process.env.RECEIPT_BASE_URL || 'http://localhost:3000',
}));
