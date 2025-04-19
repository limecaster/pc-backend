import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { HttpModule } from '@nestjs/axios';
import { OrderModule } from 'src/order/order.module';

@Module({
    imports: [HttpModule, ConfigModule, OrderModule],
    controllers: [PaymentController],
    providers: [PaymentService],
    exports: [PaymentService],
})
export class PaymentModule {}
