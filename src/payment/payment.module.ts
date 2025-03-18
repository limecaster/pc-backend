import { Module, forwardRef } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { HttpModule } from '@nestjs/axios';
import { CheckoutModule } from '../checkout/checkout.module';

@Module({
    imports: [HttpModule, forwardRef(() => CheckoutModule)],
    controllers: [PaymentController],
    providers: [PaymentService],
    exports: [PaymentService],
})
export class PaymentModule {}
