import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ProducerService } from './kafka/producer.service';
import { ConsumerService } from './kafka/consumer.service';
import { KafkaConsumer } from './kafka/kafka.consumer';
import { ViewedProductsService } from './services/viewed-products.service';
import { ViewedProductsController } from './controllers/viewed-products.controller';
import { ViewedProduct } from './entities/viewed-product.entity';
import { Product } from '../product/product.entity';
import { Customer } from '../customer/customer.entity';
import { UserBehavior } from './entities/user-behavior.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ViewedProduct,
            Product,
            Customer,
            UserBehavior,
        ]),
    ],
    controllers: [EventsController, ViewedProductsController],
    providers: [
        EventsService,
        ProducerService,
        ConsumerService,
        KafkaConsumer,
        ViewedProductsService,
    ],
    exports: [EventsService, ProducerService],
})
export class EventsModule {}
