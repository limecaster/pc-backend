import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { HttpModule } from '@nestjs/axios';
import { CheckoutModule } from '../checkout/checkout.module';
import { OrderModule } from '../order/order.module'; // Add this import
import { DiscountModule } from '../discount/discount.module'; // Import DiscountModule

@Module({
    imports: [
        HttpModule,
        forwardRef(() => CheckoutModule),
        OrderModule, // Add this import
        DiscountModule, // Add DiscountModule to imports array
        ConfigModule,
    ],
    controllers: [PaymentController],
    providers: [PaymentService],
    exports: [PaymentService],
})
export class PaymentModule {}
