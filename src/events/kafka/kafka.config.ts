import { KafkaOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

export const getKafkaConfig = (configService: ConfigService): KafkaOptions => {
    const brokers = configService
        .get<string>('KAFKA_BROKERS', 'localhost:9092')
        .split(',');
    const clientId = configService.get<string>(
        'KAFKA_CLIENT_ID',
        'pc-ecommerce-app',
    );
    const groupId = configService.get<string>(
        'KAFKA_GROUP_ID',
        'pc-ecommerce-group',
    );

    return {
        transport: Transport.KAFKA,
        options: {
            client: {
                clientId,
                brokers,
            },
            consumer: {
                groupId,
                allowAutoTopicCreation: true,
            },
            producer: {
                allowAutoTopicCreation: true,
            },
        },
    };
};
