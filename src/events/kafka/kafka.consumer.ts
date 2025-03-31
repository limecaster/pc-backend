import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConsumerService } from './consumer.service';
import { Logger } from '@nestjs/common';
import { EventsService } from '../events.service';
import { ProductClickEventDto } from '../dto/create-event.dto';

@Injectable()
export class KafkaConsumer implements OnModuleInit {
    private readonly logger = new Logger(KafkaConsumer.name);

    constructor(
        private readonly consumerService: ConsumerService,
        private readonly eventsService: EventsService,
    ) {}

    async onModuleInit() {
        await this.consumerService.consume(
            { topics: ['user-behavior'] },
            {
                eachMessage: async ({ topic, partition, message }) => {
                    this.logger.debug(`Received message from topic ${topic}`);

                    const messageValue = message.value.toString();
                    try {
                        const eventData = JSON.parse(messageValue);

                        switch (eventData.eventType) {
                            case 'product_click':
                                await this.eventsService.handleProductClick(
                                    eventData as ProductClickEventDto,
                                );
                                break;
                            case 'product_viewed':
                                await this.eventsService.handleProductView(
                                    eventData,
                                );
                                break;
                            case 'product_added_to_cart':
                                await this.eventsService.handleCartEvent(
                                    eventData,
                                    'product_added_to_cart',
                                );
                                break;
                            case 'product_removed_from_cart':
                                await this.eventsService.handleCartEvent(
                                    eventData,
                                    'product_removed_from_cart',
                                );
                                break;
                            case 'order_created':
                                await this.eventsService.handleOrderEvent(
                                    eventData,
                                    'order_created',
                                );
                                break;
                            case 'payment_completed':
                                await this.eventsService.handleOrderEvent(
                                    eventData,
                                    'payment_completed',
                                );
                                break;
                            // Add cases for other event types as needed
                            default:
                                this.logger.warn(
                                    `Unknown event type: ${eventData.eventType}`,
                                );
                        }
                    } catch (error) {
                        this.logger.error(
                            `Error processing Kafka message: ${error.message}`,
                        );
                    }
                },
            },
        );
    }
}
