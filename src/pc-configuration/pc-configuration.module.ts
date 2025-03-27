import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PCConfigurationController } from './pc-configuration.controller';
import { PCConfigurationService } from './pc-configuration.service';
import { PCConfiguration } from './entities/pc-configuration.entity';
import { PCConfigurationProduct } from './entities/pc-configuration-product.entity';

@Module({
    imports: [TypeOrmModule.forFeature([PCConfiguration, PCConfigurationProduct])],
    controllers: [PCConfigurationController],
    providers: [PCConfigurationService],
    exports: [PCConfigurationService],
})
export class PCConfigurationModule {}
