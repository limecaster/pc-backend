import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { Customer } from '../../customer/customer.entity';
import { Order } from '../../order/order.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Customer, Order])],
    controllers: [OverviewController],
    providers: [OverviewService],
    exports: [OverviewService],
})
export class OverviewModule {}
