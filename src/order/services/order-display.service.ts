import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../order.entity';

@Injectable()
export class OrderDisplayService {
    private readonly logger = new Logger(OrderDisplayService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,
    ) {}

    /**
     * Get order tracking information
     */
    async getOrderTrackingInfo(
        orderId: number | string,
        limitedInfo: boolean = false,
    ) {
        this.logger.log(
            `Fetching ${limitedInfo ? 'limited' : 'full'} tracking info for order: ${orderId}`,
        );

        try {
            // Find order with relations
            let order;
            const isNumeric = !isNaN(Number(orderId));
            if (isNumeric) {
                order = await this.orderRepository.findOne({
                    where: { id: Number(orderId) },
                    relations: ['customer', 'items', 'items.product'],
                });
            } else {
                order = await this.orderRepository.findOne({
                    where: { orderNumber: orderId as string },
                    relations: ['customer', 'items', 'items.product'],
                });
            }

            if (!order) {
                throw new NotFoundException(`Order ${orderId} not found`);
            }

            // Generate activities based on order status and dates
            const activities = this.generateOrderActivities(order);

            // Create base tracking info object
            const baseTrackingInfo = {
                id: order.id,
                orderNumber: order.orderNumber || `ORD-${order.id}`,
                orderDate: order.orderDate,
                status: order.status,
                estimatedDeliveryDate: this.calculateEstimatedDelivery(order),
                activities: activities,
            };

            // For limited info mode, return just the basics without masking
            if (limitedInfo) {
                return {
                    ...baseTrackingInfo,
                    shippingAddress: {
                        fullName: order.customerName || 'N/A',
                        address: order.deliveryAddress || 'N/A',
                        city: order.deliveryCity || '',
                        phone: order.customerPhone || 'N/A',
                    },
                    paymentMethod: order.paymentMethod,
                    // Don't include items for privacy
                    itemCount: order.items?.length || 0,
                    total: parseFloat(order.total.toString()),
                };
            }
            
            // Return full tracking information for verified requests
            return {
                ...baseTrackingInfo,
                items: order.items.map((item) => ({
                    id: item.product.id,
                    name: item.product.name,
                    price: parseFloat(item.subPrice.toString()),
                    quantity: item.quantity,
                    image: this.getProductImageUrl(item.product),
                })),
                shippingAddress: {
                    fullName:
                        order.customerName ||
                        (order.customer
                            ? `${order.customer.firstname} ${order.customer.lastname}`
                            : 'N/A'),
                    address: order.deliveryAddress || 'N/A',
                    phone:
                        order.customerPhone ||
                        (order.customer ? order.customer.phoneNumber : 'N/A'),
                },
                paymentMethod: order.paymentMethod,
                subtotal: parseFloat(
                    order.subtotal?.toString() || order.total.toString(),
                ),
                shippingFee: parseFloat(order.shippingFee?.toString() || '0'),
                total: parseFloat(order.total.toString()),
            };
        } catch (error) {
            this.logger.error(
                `Error fetching order tracking info: ${error.message}`,
            );
            throw error;
        }
    }

    // Helper method to extract image URL from product
    private getProductImageUrl(product: any): string {
        // Default placeholder
        const placeholder = '/images/image-placesholder.webp';

        // Check for additional_images field which might contain image URLs
        if (product.additional_images) {
            try {
                const images = JSON.parse(product.additional_images);
                if (Array.isArray(images) && images.length > 0) {
                    return images[0];
                }
            } catch (e) {
                this.logger.warn(
                    `Error parsing additional_images for product ${product.id}: ${e.message}`,
                );
            }
        }

        // Check for other possible image fields that might be available
        if (product.imageUrl) {
            return product.imageUrl;
        }

        if (product.thumbnail) {
            return product.thumbnail;
        }

        return placeholder;
    }

    private generateOrderActivities(order: Order) {
        const activities = [];
        const statuses = this.getOrderStatusSequence();
        const currentStatusIndex = statuses.findIndex(
            (s) => s.status === order.status,
        );

        // Add all activities up to the current status
        for (let i = 0; i <= currentStatusIndex; i++) {
            const statusInfo = statuses[i];
            let timestamp = '';

            // Use actual timestamps for certain statuses if available
            if (statusInfo.status === OrderStatus.PENDING_APPROVAL) {
                timestamp = this.formatDate(order.orderDate);
            } else if (
                statusInfo.status === OrderStatus.APPROVED &&
                order.approvalDate
            ) {
                timestamp = this.formatDate(order.approvalDate);
            } else if (
                statusInfo.status === OrderStatus.SHIPPING &&
                order.shippedAt
            ) {
                timestamp = this.formatDate(order.shippedAt);
            } else if (
                statusInfo.status === OrderStatus.DELIVERED &&
                order.deliveredAt
            ) {
                timestamp = this.formatDate(order.deliveredAt);
            } else if (i < currentStatusIndex) {
                // For intermediate statuses without specific timestamps, estimate one
                timestamp = this.formatDate(
                    this.estimateTimestampForStatus(order, i),
                );
            } else if (i === currentStatusIndex) {
                timestamp = this.formatDate(order.updatedAt || order.orderDate);
            }

            activities.push({
                id: i.toString(),
                status: statusInfo.label,
                message: statusInfo.message,
                timestamp: timestamp,
                isCompleted: true,
            });
        }

        // Add future statuses as incomplete
        for (let i = currentStatusIndex + 1; i < statuses.length; i++) {
            const statusInfo = statuses[i];
            activities.push({
                id: i.toString(),
                status: statusInfo.label,
                message: statusInfo.message,
                timestamp: '',
                isCompleted: false,
            });
        }

        return activities;
    }

    private getOrderStatusSequence() {
        return [
            {
                status: OrderStatus.PENDING_APPROVAL,
                label: 'Đơn hàng đã được tạo',
                message: 'Đơn hàng của bạn đã được đặt thành công.',
            },
            {
                status: OrderStatus.APPROVED,
                label: 'Đã xác nhận đơn hàng',
                message:
                    'Đơn hàng của bạn đã được xác nhận và đang được xử lý.',
            },
            {
                status: OrderStatus.PAYMENT_SUCCESS,
                label: 'Đã thanh toán',
                message: 'Đơn hàng của bạn đã được thanh toán thành công.',
            },
            {
                status: OrderStatus.PROCESSING,
                label: 'Đang đóng gói',
                message:
                    'Đơn hàng của bạn đang được đóng gói chuẩn bị giao cho đơn vị vận chuyển.',
            },
            {
                status: OrderStatus.SHIPPING,
                label: 'Đang vận chuyển',
                message:
                    'Đơn hàng đã được bàn giao cho đơn vị vận chuyển và đang trên đường giao hàng.',
            },
            {
                status: OrderStatus.DELIVERED,
                label: 'Đã giao hàng',
                message: 'Đơn hàng đã được giao thành công.',
            },
        ];
    }

    private calculateEstimatedDelivery(order: Order) {
        // If already delivered, use the actual delivery date
        if (order.status === OrderStatus.DELIVERED && order.deliveredAt) {
            return this.formatDate(order.deliveredAt);
        }

        // Otherwise, estimate delivery date (5 days from order date)
        const estimatedDate = new Date(order.orderDate);
        estimatedDate.setDate(estimatedDate.getDate() + 5);
        return this.formatDate(estimatedDate);
    }

    private formatDate(date: Date) {
        if (!date) return '';

        // Format: DD/MM/YYYY, HH:MM
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(date));
    }

    private estimateTimestampForStatus(order: Order, statusIndex: number) {
        // Create estimated timestamps based on order date and status sequence
        const orderDate = new Date(order.orderDate);
        const hoursToAdd = statusIndex * 8; // Add 8 hours per status

        const estimatedDate = new Date(orderDate);
        estimatedDate.setHours(orderDate.getHours() + hoursToAdd);

        return estimatedDate;
    }
}
