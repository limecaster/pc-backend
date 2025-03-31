import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerController } from './customer.controller';
import { CustomerAdminController } from './customer-admin.controller';
import { CustomerService } from './customer.service';
import { Customer } from './customer.entity';
import { OrderModule } from '../order/order.module';

@Module({
    imports: [TypeOrmModule.forFeature([Customer]), OrderModule],
    controllers: [CustomerController, CustomerAdminController],
    providers: [CustomerService],
    exports: [CustomerService],
})
export class CustomerModule {}
