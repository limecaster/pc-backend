import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from '../product/product.entity';
import { EmailModule } from '../email/email.module';
import { ScheduleModule } from '@nestjs/schedule';
import { OrderTrackingService } from './services/order-tracking.service';
import { OrderStatusService } from './services/order-status.service';
import { OrderInventoryService } from './services/order-inventory.service';
import { OrderDisplayService } from './services/order-display.service';
import { ProductModule } from '../product/product.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Order, OrderItem, Product]),
        EmailModule,
        ScheduleModule.forRoot(),
        ProductModule,
    ],
    controllers: [OrderController],
    providers: [
        OrderService,
        OrderTrackingService,
        OrderStatusService,
        OrderInventoryService,
        OrderDisplayService,
    ],
    exports: [OrderService, OrderInventoryService],
})
export class OrderModule {}
