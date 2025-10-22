import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EnvConfig } from '../../config/env.schema';

@Injectable()
export class MigrationService implements OnApplicationBootstrap {
  constructor(
    @Inject(getDataSourceToken())
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<EnvConfig>,
  ) {}

  async onApplicationBootstrap() {
    const nodeEnv = this.configService.get('NODE_ENV');
    const autoRunMigrations = this.configService.get('AUTO_RUN_MIGRATIONS');
    
    if (autoRunMigrations) {
      try {
        console.log(`Running database migrations in ${nodeEnv} mode...`);
        await this.dataSource.runMigrations();
        console.log('Database migrations completed successfully');
      } catch (error) {
        console.error('Error running migrations:', error);
        process.exit(1);
      }
    } else {
      console.log('Automatic migrations disabled. Run migrations manually with: yarn migration:run');
    }
  }
}
