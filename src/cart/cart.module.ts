import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product } from '../product/product.entity';
import { Customer } from '../customer/customer.entity';
import { Neo4jConfigService } from 'config/neo4j.config';

@Module({
    imports: [TypeOrmModule.forFeature([Cart, CartItem, Product, Customer])],
    controllers: [CartController],
    providers: [CartService, Neo4jConfigService],
    exports: [CartService],
})
export class CartModule {}
