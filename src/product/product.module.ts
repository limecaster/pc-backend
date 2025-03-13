import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ConfigModule } from '@nestjs/config';
import { PostgresConfigService } from '../../config/postgres.config';
import { Neo4jConfigService } from 'config/neo4j.config';
import { UtilsService } from 'service/utils.service';
import { Product } from './product.entity';
import { CloudinaryConfigService } from '../config/cloudinary.config';
import { CloudinaryModule } from '../config/cloudinary.module';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([Product]),
        CloudinaryModule, // Import CloudinaryModule here
    ],
    controllers: [ProductController],
    providers: [
        ProductService,
        PostgresConfigService,
        Neo4jConfigService,
        UtilsService,
        CloudinaryConfigService,
    ],
    exports: [ProductService],
})
export class ProductModule {}
