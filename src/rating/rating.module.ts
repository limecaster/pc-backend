import { Module } from '@nestjs/common';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';
import { PostgresConfigService } from '../../config/postgres.config';

@Module({
    controllers: [RatingController],
    providers: [RatingService, PostgresConfigService],
    exports: [RatingService],
})
export class RatingModule {}
