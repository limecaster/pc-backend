import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountService } from './discount.service';
import { DiscountController } from './discount.controller';
import { Discount } from './discount.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Discount])],
  controllers: [DiscountController],
  providers: [DiscountService],
  exports: [DiscountService], // Make sure DiscountService is exported
})
export class DiscountModule {}
