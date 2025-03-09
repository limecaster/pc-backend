import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customer/customer.entity';
import { Address } from '../customer/address.entity';
import { Order } from '../order/order.entity';
import { AccountModule } from './account/account.module';
import { OverviewModule } from './overview/overview.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Customer, Address, Order]), 
        AccountModule, 
        OverviewModule
    ],
})
export class DashboardModule {}
