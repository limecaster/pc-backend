import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../order.entity';
import { OrderItem } from '../order-item.entity';
import { ProductSpecificationService } from '../../product/services/product-specification.service';
import { OrderStatus } from '../order.entity';

@Injectable()
export class OrderDisplayService {
    private readonly logger = new Logger(OrderDisplayService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,

        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,

        private productSpecificationService: ProductSpecificationService,
    ) { }

    /**
     * Get order tracking information by order number (preferred)
     * @param orderNumber The order number to find
     * @param limitedInfo Whether to return limited info (public view) or full info
     * @returns Order tracking data
     */
    async getOrderTrackingInfo(
        orderNumber: string,
        limitedInfo: boolean = false,
    ): Promise<any> {
        try {
            // Find the order by orderNumber
            const order = await this.orderRepository.findOne({
                where: { orderNumber },
                relations: ['customer'],
            });

            if (!order) {
                // this.logger.warn(`Order with number ${orderNumber} not found`);
                return null;
            }

            return this.formatOrderForTracking(order, limitedInfo);
        } catch (error) {
            this.logger.error(
                `Error getting order tracking info: ${error.message}`,
            );
            throw error;
        }
    }

    /**
     * Get order tracking information by ID (fallback for backward compatibility)
     * @param orderId The order ID to find
     * @param limitedInfo Whether to return limited info or full info
     * @returns Order tracking data
     */
    async getOrderTrackingInfoById(
        orderId: number,
        limitedInfo: boolean = false,
    ): Promise<any> {
        try {
            // Find the order by ID
            const order = await this.orderRepository.findOne({
                where: { id: orderId },
                relations: ['customer'],
            });

            if (!order) {
                // this.logger.warn(`Order with ID ${orderId} not found`);
                return null;
            }

            return this.formatOrderForTracking(order, limitedInfo);
        } catch (error) {
            this.logger.error(
                `Error getting order tracking info by ID: ${error.message}`,
            );
            throw error;
        }
    }

    /**
     * Format order data for tracking display
     */
    private async formatOrderForTracking(
        order: Order,
        limitedInfo: boolean,
    ): Promise<any> {
        // For limited info (public view without verification), just return basic details
        if (limitedInfo) {
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                orderDate: order.orderDate,
                status: order.status,
            };
        }

        try {
            // Try multiple query strategies to ensure we get the items
            let items = [];

            // Strategy 1: Use query builder with left join
            try {
                items = await this.orderItemRepository
                    .createQueryBuilder('item')
                    .leftJoinAndSelect('item.product', 'product')
                    .where('item.order = :orderId', { orderId: order.id })
                    .getMany();
            } catch (error) {
                this.logger.error(`Strategy 1 failed: ${error.message}`);
            }

            // Strategy 2: Use raw SQL if strategy 1 failed or returned no items
            if (!items || items.length === 0) {
                try {
                    // Directly query the order_items table with a raw query
                    const rawItems = await this.orderItemRepository.query(
                        `SELECT oi.*, p.id as product_id, p.name as product_name 
                         FROM "Order_Detail" oi 
                         LEFT JOIN "Products" p ON oi.product_id = p.id 
                         WHERE oi.order_id = $1`,
                        [order.id],
                    );

                    if (rawItems && rawItems.length > 0) {

                        items = rawItems.map((item) => ({
                            id: item.id,
                            quantity: item.quantity,
                            price: item.price,
                            originalPrice: item.original_price,
                            product: {
                                id: item.product_id,
                                name: item.product_name,
                            },
                            order: { id: order.id },
                        }));
                    }
                } catch (error) {
                    this.logger.error(`Strategy 2 failed: ${error.message}`);
                }
            }

            // Strategy 3: As a last resort, create placeholder items if we still have none
            if (!items || items.length === 0) {
                items = [
                    {
                        id: 0,
                        quantity: 1,
                        price: order.total,
                        originalPrice: order.total,
                        product: {
                            id: 'unknown',
                            name: 'Đơn hàng #' + order.orderNumber,
                        },
                        order: { id: order.id },
                    },
                ];
            }

            const activities = this.generateOrderActivities(order);

            const productIds = items
                .filter((item) => item.product && item.product.id)
                .map((item) => item.product.id);

            let productSpecs = {};
            try {
                if (productIds.length > 0) {
                    productSpecs =
                        await this.productSpecificationService.getSpecificationsInBatch(
                            productIds,
                        );
                }
            } catch (error) {
                this.logger.error(
                    `Order ${order.id}: Failed to fetch product specifications: ${error.message}`,
                );
            }

            const shippingAddress = {
                fullName:
                    order.customerName ||
                    (order.customer
                        ? `${order.customer.firstname || ''} ${order.customer.lastname || ''}`.trim()
                        : 'Không có thông tin'),
                address: order.deliveryAddress || 'Không có thông tin',
                city: order.deliveryCity || 'Không có thông tin',
                phone:
                    order.customerPhone ||
                    (order.customer
                        ? order.customer.phoneNumber
                        : 'Không có thông tin'),
            };
            const formattedItems =
                items && items.length > 0
                    ? items.map((item) => {
                        const productId = item.product?.id;
                        const specs = productId
                            ? productSpecs[productId]
                            : null;

                        const formattedItem = {
                            id: productId || item.id.toString() || 'unknown',
                            name: item.product?.name || 'Sản phẩm',
                            price: item.price || 0,
                            originalPrice: item.originalPrice || 0,
                            quantity: item.quantity || 0,
                            image:
                                specs?.imageUrl ||
                                specs?.images?.[0] ||
                                '/images/product-placeholder.jpg',
                        };

                        // Log when images are missing - commented out non-critical log
                        // if (!specs?.imageUrl && !specs?.images?.[0]) {
                        //     this.logger.warn(`Order ${order.id}: No image found for product ${productId}`);
                        // }

                        return formattedItem;
                    })
                    : [];

            // this.logger.debug(`Order ${order.id}: Sending ${formattedItems.length} formatted items to frontend`);

            const result = {
                id: order.id,
                orderNumber: order.orderNumber,
                orderDate: order.orderDate,
                status: order.status,
                estimatedDeliveryDate:
                    order.status === OrderStatus.SHIPPING
                        ? this.calculateEstimatedDelivery(order.shippedAt)
                        : undefined,
                activities,
                items: formattedItems,
                shippingAddress,
                paymentMethod: order.paymentMethod || 'Không có thông tin',
                subtotal: order.subtotal || order.total,
                shippingFee: order.shippingFee || 0,
                total: order.total,
            };

            // this.logger.debug(`Order ${order.id}: Final tracking response has ${result.items.length} items and ${result.activities.length} activities`);

            return result;
        } catch (error) {
            this.logger.error(
                `Error formatting order ${order.id} for tracking: ${error.message}`,
                error.stack,
            );
            // Return basic info with error indication
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                orderDate: order.orderDate,
                status: order.status,
                error: 'Error processing order details',
                items: [],
                activities: this.generateOrderActivities(order),
                shippingAddress: {
                    fullName: order.customerName || 'Không có thông tin',
                    address: order.deliveryAddress || 'Không có thông tin',
                    city: order.deliveryCity || 'Không có thông tin',
                    phone: order.customerPhone || 'Không có thông tin',
                },
                paymentMethod: order.paymentMethod || 'Không có thông tin',
                subtotal: order.subtotal || order.total,
                shippingFee: order.shippingFee || 0,
                total: order.total,
            };
        }
    }

    /**
     * Generate order activities based on status and timestamps
     */
    private generateOrderActivities(order: Order): any[] {
        const activities = [];
        const now = new Date();

        // Order placed
        activities.push({
            id: '1',
            status: 'Đặt hàng',
            message: 'Đơn hàng đã được tạo thành công',
            timestamp: new Date(order.orderDate).toLocaleString('vi-VN'),
            isCompleted: true,
        });

        // Order approved
        if (order.status !== OrderStatus.PENDING_APPROVAL) {
            activities.push({
                id: '2',
                status: 'Xác nhận',
                message: 'Đơn hàng đã được xác nhận',
                timestamp: order.approvalDate
                    ? new Date(order.approvalDate).toLocaleString('vi-VN')
                    : new Date(order.updatedAt).toLocaleString('vi-VN'),
                isCompleted: true,
            });
        } else {
            activities.push({
                id: '2',
                status: 'Xác nhận',
                message: 'Đơn hàng đang chờ xác nhận',
                timestamp: null,
                isCompleted: false,
            });
        }

        // Payment status
        if (
            [
                OrderStatus.PAYMENT_SUCCESS,
                OrderStatus.PROCESSING,
                OrderStatus.SHIPPING,
                OrderStatus.DELIVERED,
                OrderStatus.COMPLETED,
            ].includes(order.status)
        ) {
            activities.push({
                id: '3',
                status: 'Thanh toán',
                message: 'Thanh toán thành công',
                timestamp: new Date(order.updatedAt).toLocaleString('vi-VN'),
                isCompleted: true,
            });
        } else if (order.status === OrderStatus.PAYMENT_FAILURE) {
            activities.push({
                id: '3',
                status: 'Thanh toán',
                message: 'Thanh toán thất bại',
                timestamp: new Date(order.updatedAt).toLocaleString('vi-VN'),
                isCompleted: false,
            });
        } else if (order.status !== OrderStatus.PENDING_APPROVAL) {
            activities.push({
                id: '3',
                status: 'Thanh toán',
                message: 'Đang chờ thanh toán',
                timestamp: null,
                isCompleted: false,
            });
        }

        // Processing
        if (
            [
                OrderStatus.PROCESSING,
                OrderStatus.SHIPPING,
                OrderStatus.DELIVERED,
                OrderStatus.COMPLETED,
            ].includes(order.status)
        ) {
            activities.push({
                id: '4',
                status: 'Xử lý',
                message: 'Đơn hàng đang được chuẩn bị',
                timestamp: new Date(order.updatedAt).toLocaleString('vi-VN'),
                isCompleted: true,
            });
        } else if (
            order.status !== OrderStatus.PENDING_APPROVAL &&
            order.status !== OrderStatus.APPROVED &&
            order.status !== OrderStatus.CANCELLED
        ) {
            activities.push({
                id: '4',
                status: 'Xử lý',
                message: 'Đơn hàng sẽ được chuẩn bị sau khi thanh toán',
                timestamp: null,
                isCompleted: false,
            });
        }

        // Shipping
        if (
            [
                OrderStatus.SHIPPING,
                OrderStatus.DELIVERED,
                OrderStatus.COMPLETED,
            ].includes(order.status)
        ) {
            activities.push({
                id: '5',
                status: 'Vận chuyển',
                message: 'Đơn hàng đang được giao đến bạn',
                timestamp: order.shippedAt
                    ? new Date(order.shippedAt).toLocaleString('vi-VN')
                    : new Date(order.updatedAt).toLocaleString('vi-VN'),
                isCompleted: true,
            });
        } else if (
            order.status !== OrderStatus.PENDING_APPROVAL &&
            order.status !== OrderStatus.APPROVED &&
            order.status !== OrderStatus.CANCELLED &&
            order.status !== OrderStatus.PAYMENT_FAILURE
        ) {
            activities.push({
                id: '5',
                status: 'Vận chuyển',
                message: 'Đơn hàng sẽ được giao sau khi xử lý',
                timestamp: null,
                isCompleted: false,
            });
        }

        // Delivered
        if (
            [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(
                order.status,
            )
        ) {
            activities.push({
                id: '6',
                status: 'Đã giao hàng',
                message: 'Đơn hàng đã được giao thành công',
                timestamp: order.deliveredAt
                    ? new Date(order.deliveredAt).toLocaleString('vi-VN')
                    : new Date(order.updatedAt).toLocaleString('vi-VN'),
                isCompleted: true,
            });
        } else if (
            [OrderStatus.PROCESSING, OrderStatus.SHIPPING].includes(
                order.status,
            )
        ) {
            activities.push({
                id: '6',
                status: 'Đã giao hàng',
                message: 'Đơn hàng sẽ được giao trong thời gian tới',
                timestamp: null,
                isCompleted: false,
            });
        }

        // Cancelled if applicable
        if (order.status === OrderStatus.CANCELLED) {
            activities.push({
                id: '7',
                status: 'Đã hủy',
                message: 'Đơn hàng đã bị hủy',
                timestamp: new Date(order.updatedAt).toLocaleString('vi-VN'),
                isCompleted: true,
            });
        }

        return activities;
    }

    /**
     * Calculate estimated delivery date (3 days from shipped date)
     */
    private calculateEstimatedDelivery(shippedAt: Date): string {
        if (!shippedAt) return null;

        const deliveryDate = new Date(shippedAt);
        deliveryDate.setDate(deliveryDate.getDate() + 3);

        return deliveryDate.toLocaleDateString('vi-VN');
    }
}
