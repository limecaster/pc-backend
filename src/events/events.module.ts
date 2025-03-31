import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { UserBehavior } from './entities/user-behavior.entity';
import { ProducerService } from './kafka/producer.service';
import { ConsumerService } from './kafka/consumer.service';
import { KafkaConsumer } from './kafka/kafka.consumer';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [TypeOrmModule.forFeature([UserBehavior]), ConfigModule],
    controllers: [EventsController],
    providers: [EventsService, ProducerService, ConsumerService, KafkaConsumer],
    exports: [EventsService, ProducerService],
})
export class EventsModule {}
