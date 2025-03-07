import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ConfigModule } from '@nestjs/config';
import { PostgresConfigService } from '../../config/postgres.config';
import { Neo4jConfigService } from 'config/neo4j.config';

@Module({
  imports: [ConfigModule],
  controllers: [ProductController],
  providers: [ProductService, PostgresConfigService, Neo4jConfigService],
  exports: [ProductService],
})
export class ProductModule {}
