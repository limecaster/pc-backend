import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { Product } from '../product/product.entity';
import { PaymentModule } from '../payment/payment.module';
import { OrderModule } from '../order/order.module';
import { DiscountModule } from '../discount/discount.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Order, OrderItem, Product]),
        PaymentModule,
        OrderModule,
        DiscountModule,
    ],
    controllers: [CheckoutController],
    providers: [CheckoutService],
    exports: [CheckoutService],
})
export class CheckoutModule {}
