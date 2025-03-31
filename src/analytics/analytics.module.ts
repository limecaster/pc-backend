import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { UserBehavior } from '../events/entities/user-behavior.entity';
import { Order } from '../order/order.entity';
import { Product } from '../product/product.entity';
import { OrderItem } from '../order/order-item.entity';
import { Customer } from '../customer/customer.entity';
import { SalesAnalyticsService } from './services/sales-analytics.service';
import { OrderAnalyticsService } from './services/order-analytics.service';
import { InventoryAnalyticsService } from './services/inventory-analytics.service';
import { UserBehaviorAnalyticsService } from './services/user-behavior-analytics.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            UserBehavior,
            Order,
            Product,
            OrderItem,
            Customer,
        ]),
    ],
    controllers: [AnalyticsController],
    providers: [
        AnalyticsService,
        SalesAnalyticsService,
        OrderAnalyticsService,
        InventoryAnalyticsService,
        UserBehaviorAnalyticsService,
    ],
    exports: [
        AnalyticsService,
        SalesAnalyticsService,
        OrderAnalyticsService,
        InventoryAnalyticsService,
        UserBehaviorAnalyticsService,
    ],
})
export class AnalyticsModule {}
