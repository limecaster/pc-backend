import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan, LessThan } from 'typeorm';
import { UserBehavior } from './entities/user-behavior.entity';
import {
    CreateEventDto,
    ProductClickEventDto,
    DiscountUsageEventDto,
} from './dto/create-event.dto';
import { plainToClass } from 'class-transformer';

@Injectable()
export class EventsService {
    private readonly logger = new Logger(EventsService.name);

    constructor(
        @InjectRepository(UserBehavior)
        private userBehaviorRepository: Repository<UserBehavior>,
    ) {}

    async createEvent(createEventDto: CreateEventDto): Promise<UserBehavior> {
        // Safely convert customerId to number if it's a numeric string
        let customerIdNum: number | null = null;
        if (createEventDto.customerId) {
            try {
                const parsed = parseInt(createEventDto.customerId, 10);
                if (!isNaN(parsed)) {
                    customerIdNum = parsed;
                }
            } catch (e) {
                this.logger.warn(
                    `Invalid customerId: ${createEventDto.customerId}`,
                );
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

    async handleProductClick(
        productClickEvent: ProductClickEventDto,
    ): Promise<UserBehavior> {
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

    async handleCartEvent(
        eventData: any,
        eventType: string,
    ): Promise<UserBehavior> {
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

    async handleOrderEvent(
        eventData: any,
        eventType: string,
    ): Promise<UserBehavior> {
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

    async createDiscountUsageEvent(
        discountUsageDto: any,
    ): Promise<UserBehavior> {
        try {
            const newEvent = plainToClass(UserBehavior, {
                eventType: 'discount_usage',
                customerId: discountUsageDto.customerId,
                sessionId: discountUsageDto.sessionId || 'system',
                entityId: discountUsageDto.orderId,
                entityType: 'order',
                ipAddress: discountUsageDto.ipAddress,
                eventData: {
                    orderId: discountUsageDto.orderId,
                    discountType: discountUsageDto.discountType,
                    ...discountUsageDto.discountData,
                },
            });

            return await this.userBehaviorRepository.save(newEvent);
        } catch (error) {
            this.logger.error(
                `Error creating discount usage event: ${error.message}`,
            );
            throw error;
        }
    }

    async getDiscountAnalytics(query: {
        startDate?: string;
        endDate?: string;
        discountId?: string;
    }) {
        try {
            const whereClause: any = {
                eventType: 'discount_usage',
            };

            if (query.startDate && query.endDate) {
                whereClause.createdAt = Between(
                    new Date(query.startDate),
                    new Date(query.endDate),
                );
            } else if (query.startDate) {
                whereClause.createdAt = MoreThan(new Date(query.startDate));
            } else if (query.endDate) {
                whereClause.createdAt = LessThan(new Date(query.endDate));
            }

            const events = await this.userBehaviorRepository.find({
                where: whereClause,
                order: { createdAt: 'DESC' },
            });

            // Process events to extract analytics data
            const analyticsData = {
                totalDiscountAmount: 0,
                uniqueOrders: new Set(),
                uniqueCustomers: new Set(),
                discountUsageByType: {
                    manual: 0,
                    automatic: 0,
                },
                discountUsageByDiscount: {},
                averageSavingsPercent: 0,
                usageByDay: {},
            };

            let totalSavingsPercent = 0;
            let savingsCount = 0;

            events.forEach((event) => {
                if (!event.eventData) return;

                analyticsData.totalDiscountAmount += Number(
                    event.eventData.discountAmount || 0,
                );
                analyticsData.uniqueOrders.add(event.eventData.orderId);

                if (event.customerId) {
                    analyticsData.uniqueCustomers.add(event.customerId);
                }

                // Track usage by discount type
                if (event.eventData.discountType) {
                    analyticsData.discountUsageByType[
                        event.eventData.discountType
                    ]++;
                }

                // Track usage by specific discount
                if (
                    event.eventData.discountIds &&
                    Array.isArray(event.eventData.discountIds)
                ) {
                    event.eventData.discountIds.forEach((discountId) => {
                        if (
                            !analyticsData.discountUsageByDiscount[discountId]
                        ) {
                            analyticsData.discountUsageByDiscount[discountId] =
                                0;
                        }
                        analyticsData.discountUsageByDiscount[discountId]++;
                    });
                } else if (event.eventData.manualDiscountId) {
                    const discountId = String(event.eventData.manualDiscountId);
                    if (!analyticsData.discountUsageByDiscount[discountId]) {
                        analyticsData.discountUsageByDiscount[discountId] = 0;
                    }
                    analyticsData.discountUsageByDiscount[discountId]++;
                }

                // Track average savings percent
                if (typeof event.eventData.savingsPercent === 'number') {
                    totalSavingsPercent += event.eventData.savingsPercent;
                    savingsCount++;
                }

                // Track usage by day
                const date = new Date(event.createdAt)
                    .toISOString()
                    .split('T')[0];
                if (!analyticsData.usageByDay[date]) {
                    analyticsData.usageByDay[date] = 0;
                }
                analyticsData.usageByDay[date]++;
            });

            // Calculate average savings
            if (savingsCount > 0) {
                analyticsData.averageSavingsPercent =
                    totalSavingsPercent / savingsCount;
            }

            return {
                totalDiscountAmount: analyticsData.totalDiscountAmount,
                uniqueOrdersCount: analyticsData.uniqueOrders.size,
                uniqueCustomersCount: analyticsData.uniqueCustomers.size,
                discountUsageByType: analyticsData.discountUsageByType,
                discountUsageByDiscount: analyticsData.discountUsageByDiscount,
                averageSavingsPercent: analyticsData.averageSavingsPercent,
                usageByDay: analyticsData.usageByDay,
            };
        } catch (error) {
            this.logger.error(
                `Error getting discount analytics: ${error.message}`,
            );
            throw error;
        }
    }

    async getProductDiscountUsage(query: {
        productId?: string;
        discountId?: string;
    }) {
        try {
            return {
                message:
                    'Feature to be implemented based on OrderItem discount tracking',
            };
        } catch (error) {
            this.logger.error(
                `Error getting product discount usage: ${error.message}`,
            );
            throw error;
        }
    }

    /**
     * Handle session events (start and end)
     * @param eventData The session event data
     * @param eventType The type of session event (session_start or session_end)
     * @returns The created user behavior record
     */
    async handleSessionEvent(
        eventData: any,
        eventType: 'session_start' | 'session_end',
    ): Promise<UserBehavior> {
        // Parse customerId to number if it's numeric
        let customerIdNum: number | null = null;
        if (eventData.customerId) {
            try {
                const parsed = parseInt(eventData.customerId, 10);
                if (!isNaN(parsed)) {
                    customerIdNum = parsed;
                }
            } catch (e) {
                this.logger.warn(
                    `Invalid customerId in session event: ${eventData.customerId}`,
                );
            }
        }

        const createEventDto: CreateEventDto = {
            eventType,
            customerId: eventData.customerId,
            sessionId: eventData.sessionId,
            entityId: eventData.sessionId,
            entityType: 'session',
            pageUrl: eventData.pageUrl,
            referrerUrl: eventData.referrerUrl,
            deviceInfo: eventData.deviceInfo,
            ipAddress: eventData.ipAddress,
            eventData: {
                ...eventData.eventData,

                timestamp:
                    eventData.eventData?.timestamp || new Date().toISOString(),
            },
        };

        return this.createEvent(createEventDto);
    }

    /**
     * Handle user authentication events (login and logout)
     * @param eventData The authentication event data
     * @param eventType The type of auth event (user_authenticated or user_logout)
     * @returns The created user behavior record
     */
    async handleUserAuthEvent(
        eventData: any,
        eventType: 'user_authenticated' | 'user_logout',
    ): Promise<UserBehavior> {
        // Parse customerId to number if it's numeric
        let customerIdNum: number | null = null;
        const userId = eventData.customerId || eventData.eventData?.userId;

        if (userId) {
            try {
                const parsed = parseInt(userId, 10);
                if (!isNaN(parsed)) {
                    customerIdNum = parsed;
                }
            } catch (e) {
                this.logger.warn(`Invalid userId in auth event: ${userId}`);
            }
        }

        const createEventDto: CreateEventDto = {
            eventType,
            customerId: userId,
            sessionId: eventData.sessionId,
            entityId: userId,
            entityType: 'user',
            pageUrl: eventData.pageUrl,
            referrerUrl: eventData.referrerUrl,
            deviceInfo: eventData.deviceInfo,
            ipAddress: eventData.ipAddress,
            eventData: {
                ...eventData.eventData,
                timestamp:
                    eventData.eventData?.timestamp || new Date().toISOString(),
            },
        };

        return this.createEvent(createEventDto);
    }

    /**
     * Handle PC build events (auto and manual build)
     */
    async handlePCBuildEvent(eventData: any, eventType: string): Promise<void> {
        try {
            // Save event in the database
            await this.userBehaviorRepository.save({
                eventType,
                customerId: eventData.customerId
                    ? parseInt(eventData.customerId)
                    : null,
                sessionId: eventData.sessionId,
                entityId: eventData.entityId,
                entityType: eventData.entityType,
                pageUrl: eventData.pageUrl,
                referrerUrl: eventData.referrerUrl,
                deviceInfo: eventData.deviceInfo,
                ipAddress: eventData.ipAddress,
                eventData: eventData.eventData,
            });
        } catch (error) {
            this.logger.error(
                `Error handling PC build event ${eventType}: ${error.message}`,
            );
        }
    }

    /**
     * Handle chatbot events
     */
    async handleChatbotEvent(eventData: any, eventType: string): Promise<void> {
        try {
            // Save event in the database
            await this.userBehaviorRepository.save({
                eventType,
                customerId: eventData.customerId
                    ? parseInt(eventData.customerId)
                    : null,
                sessionId: eventData.sessionId,
                entityId: eventData.entityId,
                entityType: eventData.entityType,
                pageUrl: eventData.pageUrl,
                referrerUrl: eventData.referrerUrl,
                deviceInfo: eventData.deviceInfo,
                ipAddress: eventData.ipAddress,
                eventData: eventData.eventData,
            });
        } catch (error) {
            this.logger.error(
                `Error handling chatbot event ${eventType}: ${error.message}`,
            );
        }
    }
}
