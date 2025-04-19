import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Discount } from '../discount.entity';
import { Order } from '../../order/order.entity';
import { OrderItem } from '../../order/order-item.entity';

/**
 * Service for recording discount usage when orders are created
 */
@Injectable()
export class DiscountUsageService {
    private readonly logger = new Logger(DiscountUsageService.name);

    constructor(
        @InjectRepository(Discount)
        private discountRepository: Repository<Discount>,

        @InjectRepository(Order)
        private orderRepository: Repository<Order>,

        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,
    ) {}

    /**
     * Records discount usage for a completed order
     * Takes into account the quantity of products for usage counts
     *
     * @param orderId The ID of the completed order
     * @param entityManager Optional entity manager for transaction support
     */
    async recordDiscountUsage(
        orderId: number,
        entityManager?: any,
    ): Promise<void> {
        try {
            // Get repositories - either use transaction EntityManager or regular repositories
            const orderRepo = entityManager
                ? entityManager.getRepository(Order)
                : this.orderRepository;

            const discountRepo = entityManager
                ? entityManager.getRepository(Discount)
                : this.discountRepository;

            const orderItemRepo = entityManager
                ? entityManager.getRepository(OrderItem)
                : this.orderItemRepository;

            // Find the order with its discount information
            const order = await orderRepo.findOne({
                where: { id: orderId },
            });

            if (!order) {
                this.logger.error(
                    `Order ${orderId} not found - cannot record discount usage`,
                );
                return;
            }

            // Check if usage was already recorded
            if (order.discountUsageRecorded) {
                this.logger.log(
                    `Discount usage for order ${orderId} was already recorded`,
                );
                return;
            }

            // Process manual discount
            if (order.manualDiscountId) {
                const discount = await discountRepo.findOne({
                    where: { id: order.manualDiscountId },
                });

                if (discount) {
                    // Get all order items to count by quantity
                    const orderItems = await orderItemRepo.find({
                        where: { order: { id: orderId } },
                    });

                    // Calculate total quantity across all applicable items
                    const totalQuantity = orderItems.reduce((sum, item) => {
                        // If the discount targets specific products, only count those
                        if (
                            discount.targetType === 'products' &&
                            discount.productIds &&
                            discount.productIds.length > 0
                        ) {
                            if (discount.productIds.includes(item.product.id)) {
                                return sum + item.quantity;
                            }
                            return sum;
                        }

                        // For category-specific discounts
                        if (
                            discount.targetType === 'categories' &&
                            discount.categoryNames &&
                            discount.categoryNames.length > 0
                        ) {
                            // We would need product categories here, so we'll count all for now
                            return sum + item.quantity;
                        }

                        // For other discount types (customer, all)
                        return sum + item.quantity;
                    }, 0);

                    // Update discount usage count by the total quantity of applicable items
                    discount.usageCount =
                        (discount.usageCount || 0) + totalQuantity;
                    await discountRepo.save(discount);

                    this.logger.log(
                        `Recorded ${totalQuantity} usages for manual discount ${discount.id} (${discount.discountName}) from order ${orderId}`,
                    );
                }
            }

            // Process automatic discounts
            if (
                order.appliedDiscountIds &&
                order.appliedDiscountIds.length > 0
            ) {
                // Get all automatic discounts applied to this order
                const automaticDiscountIds = order.appliedDiscountIds;
                const orderItems = await orderItemRepo.find({
                    where: { order: { id: orderId } },
                    relations: ['product', 'discount'],
                });

                // Create a map to track usage count for each discount
                const discountUsageCounts = new Map<string, number>();

                // Count by quantity for each order item with a discount
                for (const item of orderItems) {
                    if (
                        item.discount &&
                        automaticDiscountIds.includes(item.discount.id)
                    ) {
                        const discountId = item.discount.id;
                        const currentCount =
                            discountUsageCounts.get(discountId) || 0;
                        discountUsageCounts.set(
                            discountId,
                            currentCount + item.quantity,
                        );
                    }
                }

                // Update each discount's usage count
                for (const [
                    discountId,
                    usageCount,
                ] of discountUsageCounts.entries()) {
                    const discount = await discountRepo.findOne({
                        where: { id: discountId },
                    });

                    if (discount) {
                        discount.usageCount =
                            (discount.usageCount || 0) + usageCount;
                        await discountRepo.save(discount);

                        this.logger.log(
                            `Recorded ${usageCount} usages for automatic discount ${discount.id} (${discount.discountName}) from order ${orderId}`,
                        );
                    }
                }
            }

            // Mark order as having recorded discount usage
            order.discountUsageRecorded = true;
            await orderRepo.save(order);

            this.logger.log(
                `Successfully recorded all discount usage for order ${orderId}`,
            );
        } catch (error) {
            this.logger.error(
                `Error recording discount usage for order ${orderId}: ${error.message}`,
            );
            throw error;
        }
    }
}
