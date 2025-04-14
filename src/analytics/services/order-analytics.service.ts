import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Order, OrderStatus } from '../../order/order.entity';
import { UserBehavior } from '../../events/entities/user-behavior.entity';

@Injectable()
export class OrderAnalyticsService {
    private readonly logger = new Logger(OrderAnalyticsService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,
        @InjectRepository(UserBehavior)
        private userBehaviorRepository: Repository<UserBehavior>,
    ) {}

    async getRefundReport(startDate: Date, endDate: Date) {
        try {
            // Get refunded/cancelled orders in date range
            const refundedOrders = await this.orderRepository.find({
                where: {
                    orderDate: Between(startDate, endDate),
                    status: In(['REFUNDED', 'CANCELLED']),
                },
            });

            // Get all completed orders for comparison
            const allOrders = await this.orderRepository.find({
                where: {
                    orderDate: Between(startDate, endDate),
                },
            });

            // Calculate summary statistics
            const totalRefunds = refundedOrders.length;
            const refundRate = allOrders.length
                ? (totalRefunds / allOrders.length) * 100
                : 0;
            const totalRefundAmount = refundedOrders.reduce(
                (sum, order) => sum + (order.total || 0),
                0,
            );
            const refundToOrderRatio =
                totalRefunds / Math.max(allOrders.length, 1);

            // Generate time series data
            const dayMap = new Map();
            const days = Math.ceil(
                (endDate.getTime() - startDate.getTime()) /
                    (1000 * 60 * 60 * 24),
            );

            for (let i = 0; i < days; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateStr = date.toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                });
                dayMap.set(dateStr, { date: dateStr, refunds: 0, amount: 0 });
            }

            refundedOrders.forEach((order) => {
                const dateStr = new Date(order.orderDate).toLocaleDateString(
                    'vi-VN',
                    { day: '2-digit', month: '2-digit' },
                );
                if (dayMap.has(dateStr)) {
                    const dayData = dayMap.get(dateStr);
                    dayData.refunds++;
                    dayData.amount += order.total || 0;
                }
            });

            // Mock data for reasons (would need actual reason tracking in database)
            const reasons = [
                {
                    reason: 'Sản phẩm lỗi',
                    count: Math.floor(totalRefunds * 0.35),
                    percentage: 35.7,
                },
                {
                    reason: 'Không đúng mô tả',
                    count: Math.floor(totalRefunds * 0.25),
                    percentage: 25.0,
                },
                {
                    reason: 'Phát hiện lỗi sau mua',
                    count: Math.floor(totalRefunds * 0.18),
                    percentage: 17.9,
                },
                {
                    reason: 'Thay đổi quyết định',
                    count: Math.floor(totalRefunds * 0.14),
                    percentage: 14.3,
                },
                {
                    reason: 'Sản phẩm trễ hạn',
                    count: Math.floor(totalRefunds * 0.07),
                    percentage: 7.1,
                },
            ];

            const cancelReasons = [
                {
                    reason: 'Tìm thấy giá tốt hơn',
                    count: Math.floor(totalRefunds * 0.3),
                    percentage: 30.0,
                },
                {
                    reason: 'Thay đổi quyết định',
                    count: Math.floor(totalRefunds * 0.25),
                    percentage: 25.0,
                },
                {
                    reason: 'Lỗi thanh toán',
                    count: Math.floor(totalRefunds * 0.2),
                    percentage: 20.0,
                },
                {
                    reason: 'Thời gian giao hàng dài',
                    count: Math.floor(totalRefunds * 0.15),
                    percentage: 15.0,
                },
                {
                    reason: 'Khác',
                    count: Math.floor(totalRefunds * 0.1),
                    percentage: 10.0,
                },
            ];

            return {
                summary: {
                    totalRefunds,
                    refundRate: Number(refundRate.toFixed(1)),
                    totalRefundAmount,
                    refundToOrderRatio: Number(refundToOrderRatio.toFixed(3)),
                },
                timeSeries: Array.from(dayMap.values()),
                reasons,
                cancelReasons,
            };
        } catch (error) {
            this.logger.error(`Error getting refund report: ${error.message}`);
            throw error;
        }
    }

    async getAbandonedCarts(startDate: Date, endDate: Date) {
        try {
            // Query active carts and completed orders within the date range
            // First, get cart-related events
            const cartEvents = await this.userBehaviorRepository.find({
                where: {
                    eventType: In(['product_added_to_cart', 'order_created']),
                    createdAt: Between(startDate, endDate),
                },
                order: {
                    sessionId: 'ASC',
                    createdAt: 'ASC',
                },
            });

            // Query actual orders from the order table
            const completedOrders = await this.orderRepository.find({
                where: {
                    orderDate: Between(startDate, endDate),
                    status: In([
                        'delivered',
                        'payment_success',
                        'processing',
                        'completed',
                    ]),
                },
            });

            // Create a set of customer IDs who completed orders
            const customersWithOrders = new Set(
                completedOrders
                    .map((order) => order.customer?.id)
                    .filter(Boolean),
            );

            // Create a map to track sessions with cart activity
            const sessionCartActivity = new Map<
                string,
                {
                    date: Date;
                    hasCart: boolean;
                    convertedToOrder: boolean;
                    customerId?: number;
                }
            >();

            // Process cart events to identify sessions with cart activity
            cartEvents.forEach((event) => {
                if (!event.sessionId) return;

                const eventDate = new Date(event.createdAt);

                if (!sessionCartActivity.has(event.sessionId)) {
                    sessionCartActivity.set(event.sessionId, {
                        date: eventDate,
                        hasCart: event.eventType === 'product_added_to_cart',
                        convertedToOrder: event.eventType === 'order_created',
                        customerId: event.customerId,
                    });
                } else {
                    const session = sessionCartActivity.get(event.sessionId);

                    // Update session data
                    if (event.eventType === 'product_added_to_cart') {
                        session.hasCart = true;
                    }

                    if (event.eventType === 'order_created') {
                        session.convertedToOrder = true;
                    }

                    // Always track customer ID if available
                    if (event.customerId && !session.customerId) {
                        session.customerId = event.customerId;
                    }

                    sessionCartActivity.set(event.sessionId, session);
                }
            });

            // Group cart activity by day
            const dayMap = new Map();
            const days = Math.ceil(
                (endDate.getTime() - startDate.getTime()) /
                    (1000 * 60 * 60 * 24),
            );

            // Initialize day map with zeros
            for (let i = 0; i < days; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateStr = date.toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                });
                dayMap.set(dateStr, {
                    date: dateStr,
                    totalCarts: 0,
                    abandonedCarts: 0,
                    rate: 0,
                });
            }

            // Process each session to count total carts and abandoned carts
            sessionCartActivity.forEach((session) => {
                if (!session.hasCart) return; // Skip sessions without cart activity

                const dateStr = session.date.toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                });

                if (!dayMap.has(dateStr)) return;

                const dayData = dayMap.get(dateStr);

                // Count this as a cart
                dayData.totalCarts++;

                // Count as abandoned if:
                // 1. No order_created event AND
                // 2. Either no customer ID or customer has no orders
                if (
                    !session.convertedToOrder &&
                    (!session.customerId ||
                        !customersWithOrders.has(session.customerId))
                ) {
                    dayData.abandonedCarts++;
                }
            });

            // Calculate abandoned cart rate for each day
            dayMap.forEach((value) => {
                // Calculate rate only if there are carts
                if (value.totalCarts > 0) {
                    value.rate = Number(
                        (
                            (value.abandonedCarts / value.totalCarts) *
                            100
                        ).toFixed(1),
                    );
                } else {
                    value.rate = 0;
                }
            });

            // Convert to array for response
            const timeSeriesData = Array.from(dayMap.values());

            // Calculate overall statistics
            const totalCarts = timeSeriesData.reduce(
                (sum, day) => sum + day.totalCarts,
                0,
            );
            const totalAbandoned = timeSeriesData.reduce(
                (sum, day) => sum + day.abandonedCarts,
                0,
            );
            const overallRate =
                totalCarts > 0
                    ? Number(((totalAbandoned / totalCarts) * 100).toFixed(1))
                    : 0;

            return timeSeriesData;
        } catch (error) {
            this.logger.error(
                `Error getting abandoned carts data: ${error.message}`,
            );
            throw error;
        }
    }
}
