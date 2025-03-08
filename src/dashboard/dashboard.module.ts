import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountController } from './account/account.controller';
import { AccountService } from './account/account.service';
import { OverviewController } from './overview/overview.controller';
import { OverviewService } from './overview/overview.service';
import { Customer } from '../customer/customer.entity';
import { Address } from '../customer/address.entity';
import { Order } from '../order/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Address, Order])],
  controllers: [AccountController, OverviewController],
  providers: [AccountService, OverviewService],
})
export class DashboardModule {}
