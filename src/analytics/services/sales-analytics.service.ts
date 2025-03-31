import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Order, OrderStatus } from '../../order/order.entity';
import { OrderItem } from '../../order/order-item.entity';

@Injectable()
export class SalesAnalyticsService {
    private readonly logger = new Logger(SalesAnalyticsService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,
        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,
    ) {}

    async getSalesReport(startDate: Date, endDate: Date) {
        try {
            // Query orders within date range - use correct enum values
            const completedStatuses = [
                OrderStatus.DELIVERED,
                OrderStatus.PAYMENT_SUCCESS,
                OrderStatus.COMPLETED,
            ];

            const orders = await this.orderRepository.find({
                where: {
                    orderDate: Between(startDate, endDate),
                    status: In(completedStatuses),
                },
                relations: ['items', 'items.product'],
            });

            // Query orders from previous period for comparison
            const previousStartDate = new Date(startDate);
            previousStartDate.setDate(
                previousStartDate.getDate() -
                    (endDate.getTime() - startDate.getTime()) /
                        (1000 * 60 * 60 * 24),
            );
            const previousEndDate = new Date(startDate);
            previousEndDate.setDate(previousEndDate.getDate() - 1);

            const previousOrders = await this.orderRepository.find({
                where: {
                    orderDate: Between(previousStartDate, previousEndDate),
                    status: In(completedStatuses),
                },
            });

            // Calculate summary statistics - ensure we handle string values
            let totalRevenue = 0;
            for (const order of orders) {
                // Handle total as string or number - many DB drivers return decimal as string
                const orderTotal =
                    typeof order.total === 'string'
                        ? parseFloat(order.total)
                        : order.total || 0;

                if (!isNaN(orderTotal)) {
                    totalRevenue += orderTotal;
                }
            }

            let previousTotalRevenue = 0;
            for (const order of previousOrders) {
                // Parse string values properly
                const orderTotal =
                    typeof order.total === 'string'
                        ? parseFloat(order.total)
                        : order.total || 0;

                if (!isNaN(orderTotal)) {
                    previousTotalRevenue += orderTotal;
                }
            }

            const revenueChange =
                previousTotalRevenue > 0
                    ? ((totalRevenue - previousTotalRevenue) /
                          previousTotalRevenue) *
                      100
                    : 0;

            // Calculate order count stats
            const orderCount = orders.length;
            const previousOrderCount = previousOrders.length;
            const orderCountChange = previousOrderCount
                ? ((orderCount - previousOrderCount) / previousOrderCount) * 100
                : 0;

            // Calculate average order value
            const averageOrderValue = orderCount
                ? totalRevenue / orderCount
                : 0;

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
                dayMap.set(dateStr, { date: dateStr, revenue: 0 });
            }

            orders.forEach((order) => {
                const dateStr = new Date(order.orderDate).toLocaleDateString(
                    'vi-VN',
                    { day: '2-digit', month: '2-digit' },
                );
                if (dayMap.has(dateStr)) {
                    const dayData = dayMap.get(dateStr);

                    // Parse the total which could be a string or number
                    const orderTotal =
                        typeof order.total === 'string'
                            ? parseFloat(order.total)
                            : order.total || 0;

                    if (!isNaN(orderTotal)) {
                        dayData.revenue += orderTotal;
                    }
                }
            });

            return {
                summary: {
                    totalRevenue,
                    orderCount,
                    averageOrderValue,
                    revenueChange,
                    orderCountChange,
                    totalTax: totalRevenue * 0.1, // Estimated tax (10%)
                },
                timeSeries: Array.from(dayMap.values()),
            };
        } catch (error) {
            this.logger.error(`Error getting sales report: ${error.message}`);
            throw error;
        }
    }

    async getBestSellingProducts(startDate: Date, endDate: Date) {
        try {
            // Use correct enum values for completed orders
            const completedStatuses = [
                OrderStatus.DELIVERED,
                OrderStatus.PAYMENT_SUCCESS,
                OrderStatus.COMPLETED,
            ];

            // Get order items for completed orders in date range
            const orderItems = await this.orderItemRepository
                .createQueryBuilder('item')
                .innerJoin('item.order', 'order')
                .innerJoinAndSelect('item.product', 'product')
                .where('order.orderDate BETWEEN :startDate AND :endDate', {
                    startDate,
                    endDate,
                })
                .andWhere('order.status IN (:...statuses)', {
                    statuses: completedStatuses,
                })
                .getMany();

            // Aggregate data by product
            const productMap = new Map();

            orderItems.forEach((item) => {
                if (!item.product) return; // Skip if product relation is missing

                const productId = item.product.id;
                if (!productMap.has(productId)) {
                    productMap.set(productId, {
                        name: item.product.name,
                        quantity: 0,
                        revenue: 0,
                    });
                }

                const productData = productMap.get(productId);
                // Parse quantity as number if it's a string
                const quantity =
                    typeof item.quantity === 'string'
                        ? parseInt(item.quantity, 10)
                        : item.quantity || 0;

                productData.quantity += quantity;

                // Calculate revenue - handle different price formats
                let price = 0;
                // Try item.price first
                if (item.price !== undefined && item.price !== null) {
                    price =
                        typeof item.price === 'string'
                            ? parseFloat(item.price)
                            : item.price;
                }
                // Fallback to product.price if item.price is not available
                else if (
                    item.product.price !== undefined &&
                    item.product.price !== null
                ) {
                    price =
                        typeof item.product.price === 'string'
                            ? parseFloat(item.product.price)
                            : item.product.price;
                }

                if (!isNaN(price)) {
                    productData.revenue += price * quantity;
                }
            });

            // Convert to array and sort by revenue
            return Array.from(productMap.values())
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5); // Return top 5
        } catch (error) {
            this.logger.error(
                `Error getting best selling products: ${error.message}`,
            );
            throw error;
        }
    }

    async getBestSellingCategories(startDate: Date, endDate: Date) {
        try {
            // Use correct enum values for completed orders
            const completedStatuses = [
                OrderStatus.DELIVERED,
                OrderStatus.PAYMENT_SUCCESS,
                OrderStatus.COMPLETED,
            ];

            // Get order items for completed orders in date range with product info
            const orderItems = await this.orderItemRepository
                .createQueryBuilder('item')
                .innerJoin('item.order', 'order')
                .innerJoinAndSelect('item.product', 'product')
                .where('order.orderDate BETWEEN :startDate AND :endDate', {
                    startDate,
                    endDate,
                })
                .andWhere('order.status IN (:...statuses)', {
                    statuses: completedStatuses,
                })
                .getMany();

            // Aggregate data by category
            const categoryMap = new Map();

            orderItems.forEach((item) => {
                if (!item.product || !item.product.category) return; // Skip if product or category is missing

                const category = item.product.category;
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, {
                        name: category,
                        value: 0,
                    });
                }

                const categoryData = categoryMap.get(category);

                // Parse price and quantity as numbers
                const price =
                    typeof item.price === 'string'
                        ? parseFloat(item.price)
                        : item.price || 0;

                const quantity =
                    typeof item.quantity === 'string'
                        ? parseInt(item.quantity, 10)
                        : item.quantity || 0;

                if (!isNaN(price) && !isNaN(quantity)) {
                    categoryData.value += price * quantity;
                }
            });

            // Convert to array and sort by value
            return Array.from(categoryMap.values())
                .sort((a, b) => b.value - a.value)
                .slice(0, 5); // Return top 5
        } catch (error) {
            this.logger.error(
                `Error getting best selling categories: ${error.message}`,
            );
            throw error;
        }
    }
}
