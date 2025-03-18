import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Order } from '../order/order.entity';
import { Customer } from '../customer/customer.entity';
import { Product } from '../product/product.entity';
import { OrderItem } from '../order/order-item.entity';
import { Address } from '../customer/address.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Order,
            Customer,
            Product,
            OrderItem,
            Address,
        ]),
    ],
    controllers: [DashboardController],
    providers: [DashboardService],
    exports: [DashboardService],
})
export class DashboardModule {}
