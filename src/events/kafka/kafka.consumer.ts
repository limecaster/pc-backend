import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConsumerService } from './consumer.service';
import { Logger } from '@nestjs/common';
import { EventsService } from '../events.service';
import { ProductClickEventDto } from '../dto/create-event.dto';
import { ViewedProductsService } from '../services/viewed-products.service';

@Injectable()
export class KafkaConsumer implements OnModuleInit {
    private readonly logger = new Logger(KafkaConsumer.name);

    constructor(
        private readonly consumerService: ConsumerService,
        private readonly eventsService: EventsService,
        private readonly viewedProductsService: ViewedProductsService,
    ) {}

    async onModuleInit() {
        await this.consumerService.consume(
            { topics: ['user-behavior'] },
            {
                eachMessage: async ({ topic, partition, message }) => {
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
                                if (eventData.customerId) {
                                    await this.viewedProductsService.trackProductView(
                                        parseInt(eventData.customerId),
                                        eventData.entityId,
                                    );
                                }
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
                            case 'session_start':
                                await this.eventsService.handleSessionEvent(
                                    eventData,
                                    'session_start',
                                );
                                break;
                            case 'session_end':
                                await this.eventsService.handleSessionEvent(
                                    eventData,
                                    'session_end',
                                );
                                break;
                            case 'user_authenticated':
                            case 'user_logout':
                                await this.eventsService.handleUserAuthEvent(
                                    eventData,
                                    eventData.eventType,
                                );
                                break;
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
