import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresConfigService } from './postgres.config';

@Module({
  imports: [ConfigModule],
  providers: [PostgresConfigService],
  exports: [PostgresConfigService],
})
export class PostgresModule {}