import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { Wishlist } from './wishlist.entity';
import { Product } from '../product/product.entity';
import { ConfigModule } from '@nestjs/config';
import { Neo4jConfigService } from '../../config/neo4j.config';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Wishlist, Product])
  ],
  controllers: [WishlistController],
  providers: [
    WishlistService,
    Neo4jConfigService
  ],
  exports: [WishlistService],
})
export class WishlistModule {}
