import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';

@Module({
    imports: [ConfigModule],
    providers: [EmailService],
    exports: [EmailService], // Make sure EmailService is exported
})
export class EmailModule {}
