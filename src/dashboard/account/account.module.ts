import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { Customer } from '../../customer/customer.entity';
import { Address } from '../../customer/address.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Customer, Address])],
    controllers: [AccountController],
    providers: [AccountService],
    exports: [AccountService],
})
export class AccountModule {}
