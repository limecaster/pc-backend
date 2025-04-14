import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FAQ } from './entities/faq.entity';
import { FAQService } from './faq.service';
import { FAQController } from './faq.controller';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [TypeOrmModule.forFeature([FAQ]), EmailModule],
    controllers: [FAQController],
    providers: [FAQService],
    exports: [FAQService],
})
export class FAQModule {}
