import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { Logger } from '@nestjs/common';

@Injectable()
export class ProducerService implements OnModuleInit, OnApplicationShutdown {
    private readonly kafka: Kafka;
    private readonly producer: Producer;
    private readonly logger = new Logger(ProducerService.name);

    constructor(private readonly configService: ConfigService) {
        const brokers = this.configService.get<string>('KAFKA_BROKERS').split(',');
        const clientId = this.configService.get<string>('KAFKA_CLIENT_ID');

        this.kafka = new Kafka({
            clientId,
            brokers,
        });
        this.producer = this.kafka.producer();
    }

    async onModuleInit() {
        await this.producer.connect();
    }

    async produce(record: ProducerRecord) {
        try {
            await this.producer.send(record);
            this.logger.debug(`Message sent to topic: ${record.topic}`);
        } catch (error) {
            this.logger.error(`Error sending message to Kafka: ${error.message}`);
            throw error;
        }
    }

    async onApplicationShutdown() {
        await this.producer.disconnect();
    }
}
