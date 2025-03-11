import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderScheduler } from './order.scheduler';
import { CheckoutModule } from '../checkout/checkout.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Order, OrderItem]),
        ScheduleModule.forRoot(),
        forwardRef(() => CheckoutModule), // Use forwardRef to break circular dependency
    ],
    controllers: [OrderController],
    providers: [OrderService, OrderScheduler],
    exports: [OrderService],
})
export class OrderModule {}
