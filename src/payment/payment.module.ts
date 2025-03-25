import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { HttpModule } from '@nestjs/axios';
import { CheckoutModule } from '../checkout/checkout.module';
import { OrderModule } from '../order/order.module';
import { DiscountModule } from '../discount/discount.module';

@Module({
    imports: [
        HttpModule,
        forwardRef(() => CheckoutModule), // Break circular dependency
        forwardRef(() => OrderModule),
        DiscountModule, 
        ConfigModule,
    ],
    controllers: [PaymentController],
    providers: [PaymentService],
    exports: [PaymentService],
})
export class PaymentModule {}
