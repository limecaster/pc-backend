import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ConfigModule } from '@nestjs/config';
import { PostgresConfigService } from '../../config/postgres.config';
import { Neo4jConfigService } from 'config/neo4j.config';
import { UtilsService } from 'service/utils.service';
import { Product } from './product.entity';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([Product])
    ],
    controllers: [ProductController],
    providers: [
        ProductService,
        PostgresConfigService,
        Neo4jConfigService,
        UtilsService,
    ],
    exports: [ProductService],
})
export class ProductModule {}
