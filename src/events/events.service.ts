import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBehavior } from './entities/user-behavior.entity';
import { CreateEventDto, ProductClickEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
    private readonly logger = new Logger(EventsService.name);

    constructor(
        @InjectRepository(UserBehavior)
        private userBehaviorRepository: Repository<UserBehavior>,
    ) {}

    async createEvent(createEventDto: CreateEventDto): Promise<UserBehavior> {
        this.logger.log(`Recording event: ${createEventDto.eventType}`);
        
        // Safely convert customerId to number if it's a numeric string
        let customerIdNum: number | null = null;
        if (createEventDto.customerId) {
            try {
                const parsed = parseInt(createEventDto.customerId, 10);
                if (!isNaN(parsed)) {
                    customerIdNum = parsed;
                }
            } catch (e) {
                this.logger.warn(`Invalid customerId: ${createEventDto.customerId}`);
            }
        }
        
        const userBehavior = this.userBehaviorRepository.create({
            customerId: customerIdNum,
            sessionId: createEventDto.sessionId,
            eventType: createEventDto.eventType,
            entityId: createEventDto.entityId,
            entityType: createEventDto.entityType,
            pageUrl: createEventDto.pageUrl,
            referrerUrl: createEventDto.referrerUrl,
            deviceInfo: createEventDto.deviceInfo,
            ipAddress: createEventDto.ipAddress,
            eventData: createEventDto.eventData,
        });

        return this.userBehaviorRepository.save(userBehavior);
    }

    async handleProductClick(productClickEvent: ProductClickEventDto): Promise<UserBehavior> {
        this.logger.log(`Product click event received for product: ${productClickEvent.productId}`);
        
        const eventData = {
            productName: productClickEvent.productName,
            category: productClickEvent.category,
            price: productClickEvent.price,
            ...productClickEvent.eventData,
        };

        const createEventDto: CreateEventDto = {
            eventType: 'product_click',
            customerId: productClickEvent.customerId,
            sessionId: productClickEvent.sessionId,
            entityId: productClickEvent.productId,
            entityType: 'product',
            pageUrl: productClickEvent.pageUrl,
            referrerUrl: productClickEvent.referrerUrl,
            deviceInfo: productClickEvent.deviceInfo,
            ipAddress: productClickEvent.ipAddress,
            eventData,
        };

        return this.createEvent(createEventDto);
    }

    async handleProductView(eventData: any): Promise<UserBehavior> {
        this.logger.log(`Product view event received for product: ${eventData.entityId || eventData.eventData?.productId}`);
        
        // The product data is now inside eventData
        const productId = eventData.entityId || eventData.eventData?.productId;
        
        if (!productId) {
            this.logger.warn('Product view event missing product ID');
        }

        const createEventDto: CreateEventDto = {
            eventType: 'product_viewed',
            customerId: eventData.customerId,
            sessionId: eventData.sessionId,
            entityId: productId,
            entityType: 'product',
            pageUrl: eventData.pageUrl,
            referrerUrl: eventData.referrerUrl,
            deviceInfo: eventData.deviceInfo,
            ipAddress: eventData.ipAddress,
            eventData: eventData.eventData,
        };

        return this.createEvent(createEventDto);
    }

    async handleCartEvent(eventData: any, eventType: string): Promise<UserBehavior> {
        this.logger.log(`Cart event received: ${eventType} for product: ${eventData.entityId || eventData.eventData?.productId}`);
        
        const productId = eventData.entityId || eventData.eventData?.productId;
        
        if (!productId) {
            this.logger.warn(`${eventType} event missing product ID`);
        }

        const createEventDto: CreateEventDto = {
            eventType,
            customerId: eventData.customerId,
            sessionId: eventData.sessionId,
            entityId: productId,
            entityType: 'product',
            pageUrl: eventData.pageUrl,
            referrerUrl: eventData.referrerUrl,
            deviceInfo: eventData.deviceInfo,
            ipAddress: eventData.ipAddress,
            eventData: eventData.eventData,
        };

        return this.createEvent(createEventDto);
    }

    async handleOrderEvent(eventData: any, eventType: string): Promise<UserBehavior> {
        this.logger.log(`Order event received: ${eventType} for order: ${eventData.entityId || eventData.eventData?.orderId}`);
        
        const orderId = eventData.entityId || eventData.eventData?.orderId;
        
        if (!orderId) {
            this.logger.warn(`${eventType} event missing order ID`);
        }

        const createEventDto: CreateEventDto = {
            eventType,
            customerId: eventData.customerId,
            sessionId: eventData.sessionId,
            entityId: orderId,
            entityType: eventType === 'order_created' ? 'order' : 'payment',
            pageUrl: eventData.pageUrl,
            referrerUrl: eventData.referrerUrl,
            deviceInfo: eventData.deviceInfo,
            ipAddress: eventData.ipAddress,
            eventData: eventData.eventData,
        };

        return this.createEvent(createEventDto);
    }

    async getEventsByCustomerId(customerId: number): Promise<UserBehavior[]> {
        return this.userBehaviorRepository.find({
            where: { customerId },
            order: { createdAt: 'DESC' },
        });
    }

    async getEventsBySessionId(sessionId: string): Promise<UserBehavior[]> {
        return this.userBehaviorRepository.find({
            where: { sessionId },
            order: { createdAt: 'DESC' },
        });
    }

    async getEventsByType(eventType: string): Promise<UserBehavior[]> {
        return this.userBehaviorRepository.find({
            where: { eventType },
            order: { createdAt: 'DESC' },
        });
    }
}
