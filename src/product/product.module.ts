import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ConfigModule } from '@nestjs/config';
import { PostgresConfigService } from '../../config/postgres.config';
import { Neo4jConfigService } from 'config/neo4j.config';
import { ElasticsearchConfigService } from 'config/elasticsearch.config';
import { UtilsService } from 'service/utils.service';
import { Product } from './product.entity';
import { CloudinaryConfigService } from '../../config/cloudinary.config';
import { CloudinaryModule } from '../../config/cloudinary.module';
import { ProductQueryService } from './services/product-query.service';
import { ProductSpecificationService } from './services/product-specification.service';
import { ProductRatingService } from './services/product-rating.service';
import { ProductElasticsearchService } from './services/product-elasticsearch.service';
import { DiscountModule } from '../discount/discount.module';
import { HotSales } from './entities/hot-sales.entity';
import { HotSalesService } from './services/hot-sales.service';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([
            Product,
            HotSales,
        ]),
        CloudinaryModule,
        DiscountModule,
    ],
    controllers: [ProductController],
    providers: [
        ProductService,
        PostgresConfigService,
        Neo4jConfigService,
        ElasticsearchConfigService,
        UtilsService,
        CloudinaryConfigService,
        ProductQueryService,
        ProductSpecificationService,
        ProductRatingService,
        ProductElasticsearchService,
        HotSalesService,
    ],
    exports: [
        ProductService,
        ProductSpecificationService,
    ],
})
export class ProductModule {}
