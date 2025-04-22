import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    Consumer,
    ConsumerRunConfig,
    ConsumerSubscribeTopics,
    Kafka,
} from 'kafkajs';

@Injectable()
export class ConsumerService implements OnApplicationShutdown {
    private readonly kafka: Kafka;
    private readonly consumers: Consumer[] = [];

    constructor(private readonly configService: ConfigService) {
        const brokers = this.configService
            .get<string>('KAFKA_BROKERS')
            .split(',');
        const clientId = this.configService.get<string>('KAFKA_CLIENT_ID');

        this.kafka = new Kafka({
            clientId,
            brokers,
            connectionTimeout: 30000,
            requestTimeout: 30000,
            retry: {
                initialRetryTime: 300,
                retries: 10,
                maxRetryTime: 30000,
                factor: 0.2,
            },
        });
    }

    async consume(topics: ConsumerSubscribeTopics, config: ConsumerRunConfig) {
        const groupId = this.configService.get<string>('KAFKA_GROUP_ID');
        const consumer = this.kafka.consumer({
            groupId,
            retry: {
                initialRetryTime: 300,
                retries: 10,
                maxRetryTime: 30000,
                factor: 0.2,
            },
        });

        await consumer.connect();
        await consumer.subscribe(topics);
        await consumer.run(config);

        this.consumers.push(consumer);

        return consumer;
    }

    async onApplicationShutdown() {
        for (const consumer of this.consumers) {
            await consumer.disconnect();
        }
    }
}
