import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { Staff } from './staff.entity';
import { OrderModule } from '../order/order.module';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [TypeOrmModule.forFeature([Staff]), OrderModule, EmailModule],
    providers: [StaffService],
    controllers: [StaffController],
    exports: [StaffService],
})
export class StaffModule {}
