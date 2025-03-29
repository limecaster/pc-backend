import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { CmsContent } from './cms-content.entity';
import { CloudinaryConfigService } from '../../config/cloudinary.config';

@Module({
    imports: [TypeOrmModule.forFeature([CmsContent])],
    controllers: [CmsController],
    providers: [CmsService, CloudinaryConfigService],
    exports: [CmsService],
})
export class CmsModule {}
