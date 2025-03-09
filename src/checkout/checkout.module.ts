import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { PaymentModule } from '../payment/payment.module';
import { CustomerModule } from '../customer/customer.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    forwardRef(() => PaymentModule),
    CustomerModule,
    OrderModule
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService]
})
export class CheckoutModule {}
