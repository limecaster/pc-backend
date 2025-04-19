import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Discount } from './discount.entity';
import { DiscountUsageService } from './services/discount-usage.service';
import { Order } from 'src/order/order.entity';
import { OrderItem } from 'src/order/order-item.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Discount, Order, OrderItem])],
    controllers: [DiscountController],
    providers: [DiscountService, DiscountUsageService],
    exports: [DiscountService, DiscountUsageService],
})
export class DiscountModule {}
