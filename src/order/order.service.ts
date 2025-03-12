import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderDto } from './dto/order.dto';
import * as crypto from 'crypto';

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);
    // Store OTPs with expiry times
    private otpStore: Map<string, { otp: string, expires: Date }> = new Map();

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,

        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,
    ) {}

    async findOrderWithItems(id: number): Promise<OrderDto> {
        // Get the order
        const order = await this.orderRepository.findOne({
            where: { id },
            relations: ['customer'],
        });

        if (!order) {
            return null;
        }

        // Get the order items
        const items = await this.orderItemRepository.find({
            where: { order: { id: order.id } },
            relations: ['product'],
        });

        // Combine into DTO
        const orderDto: OrderDto = {
            ...order,
            items,
            customerId: order.customer?.id,
        };

        return orderDto;
    }

    async findOrderByNumber(orderNumber: string): Promise<OrderDto> {
        // Find the order by orderNumber
        const order = await this.orderRepository.findOne({
            where: { orderNumber },
            relations: ['customer'],
        });

        if (!order) {
            return null;
        }

        // Get the order items
        const items = await this.orderItemRepository.find({
            where: { order: { id: order.id } },
            relations: ['product'],
        });

        // Combine into DTO
        const orderDto: OrderDto = {
            ...order,
            items,
            customerId: order.customer?.id,
        };

        return orderDto;
    }

    async findOrdersByCustomerId(customerId: number): Promise<OrderDto[]> {
        const orders = await this.orderRepository.find({
            where: { customer: { id: customerId } },
            relations: ['customer'],
            order: { orderDate: 'DESC' },
        });

        if (!orders || orders.length === 0) {
            return [];
        }

        // For each order, get the order items and build DTOs
        const orderDtos: OrderDto[] = [];

        for (const order of orders) {
            const items = await this.orderItemRepository.find({
                where: { order: { id: order.id } },
                relations: ['product'],
            });

            const orderDto: OrderDto = {
                ...order,
                items,
                customerId: order.customer?.id,
            };

            orderDtos.push(orderDto);
        }

        return orderDtos;
    }

    async updateOrderStatus(
        orderId: number,
        status: OrderStatus,
        staffId?: number,
    ): Promise<Order> {
        this.logger.log(`Updating order ${orderId} status to ${status}`);

        const order = await this.orderRepository.findOne({
            where: { id: orderId },
        });

        if (!order) {
            throw new NotFoundException(`Order with ID ${orderId} not found`);
        }

        // Validate status transitions
        await this.validateStatusTransition(order.status, status, staffId);

        order.status = status;

        // Handle specific status-related actions
        if (status === OrderStatus.APPROVED && staffId) {
            order.approvedBy = staffId;
            order.approvalDate = new Date();
        } else if (status === OrderStatus.DELIVERED) {
            order.receiveDate = new Date();
        }

        return this.orderRepository.save(order);
    }

    private async validateStatusTransition(
        currentStatus: OrderStatus,
        newStatus: OrderStatus,
        staffId?: number,
    ): Promise<void> {
        // Define valid status transitions
        const validTransitions = {
            [OrderStatus.PENDING_APPROVAL]: [
                OrderStatus.APPROVED,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.APPROVED]: [
                OrderStatus.PAYMENT_SUCCESS,
                OrderStatus.PAYMENT_FAILURE,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.PAYMENT_SUCCESS]: [OrderStatus.PROCESSING],
            [OrderStatus.PAYMENT_FAILURE]: [
                OrderStatus.APPROVED,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.PROCESSING]: [
                OrderStatus.SHIPPING,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.SHIPPING]: [OrderStatus.DELIVERED],
            [OrderStatus.DELIVERED]: [],
            [OrderStatus.CANCELLED]: [],
        };

        // Check if transition is valid
        if (!validTransitions[currentStatus].includes(newStatus)) {
            throw new ForbiddenException(
                `Cannot transition from ${currentStatus} to ${newStatus}`,
            );
        }

        // Staff approval is required for certain transitions
        if (newStatus === OrderStatus.APPROVED && !staffId) {
            throw new ForbiddenException(
                'Staff ID required for order approval',
            );
        }
    }

    // Method to find orders that need staff approval
    async findPendingApprovalOrders(): Promise<OrderDto[]> {
        const orders = await this.orderRepository.find({
            where: { status: OrderStatus.PENDING_APPROVAL },
            relations: ['customer'],
            order: { orderDate: 'DESC' },
        });

        // Convert to DTOs with items
        const orderDtos: OrderDto[] = [];

        for (const order of orders) {
            const items = await this.orderItemRepository.find({
                where: { order: { id: order.id } },
                relations: ['product'],
            });

            orderDtos.push({
                ...order,
                items,
                customerId: order.customer?.id,
            });
        }

        return orderDtos;
    }

    // Scheduled task to automatically update shipping orders to delivered
    async updateShippingOrdersToDelivered(
        daysInTransit: number = 3,
    ): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysInTransit);

        this.logger.log(
            `Checking for shipping orders older than ${cutoffDate.toISOString()}`,
        );

        const shippingOrders = await this.orderRepository.find({
            where: {
                status: OrderStatus.SHIPPING,
                updatedAt: LessThan(cutoffDate), // Orders that haven't been updated for X days
            },
        });

        this.logger.log(
            `Found ${shippingOrders.length} orders to mark as delivered`,
        );

        for (const order of shippingOrders) {
            order.status = OrderStatus.DELIVERED;
            order.receiveDate = new Date();
            await this.orderRepository.save(order);
            this.logger.log(
                `Order #${order.id} automatically marked as delivered`,
            );
        }
    }

    async getOrderTrackingInfo(orderId: number | string, limitedInfo: boolean = false) {
        this.logger.log(`Fetching ${limitedInfo ? 'limited' : 'full'} tracking info for order: ${orderId}`);
        
        try {
            // Find order with relations
            let order;
            if (typeof orderId === 'number') {
                order = await this.orderRepository.findOne({
                    where: { id: orderId },
                    relations: ['customer', 'items', 'items.product'],
                });
            } else {
                order = await this.orderRepository.findOne({
                    where: { orderNumber: orderId },
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
                items: order.items.map(item => ({
                    id: item.product.id,
                    name: item.product.name,
                    price: parseFloat(item.subPrice.toString()),
                    quantity: item.quantity,
                    image: this.getProductImageUrl(item.product),
                })),
                shippingAddress: {
                    fullName: order.customerName || (order.customer ? `${order.customer.firstname} ${order.customer.lastname}` : 'N/A'),
                    address: order.deliveryAddress || 'N/A',
                    city: order.deliveryCity || '',
                    phone: order.customerPhone || (order.customer ? order.customer.phoneNumber : 'N/A'),
                },
                paymentMethod: order.paymentMethod,
                subtotal: parseFloat(order.subtotal?.toString() || order.total.toString()),
                shippingFee: parseFloat(order.shippingFee?.toString() || '0'),
                total: parseFloat(order.total.toString()),
            };
        } catch (error) {
            this.logger.error(`Error fetching order tracking info: ${error.message}`);
            throw error;
        }
    }

    // Add a method to verify order access
    async verifyOrderAccess(orderId: number, verificationData: string): Promise<boolean> {
        this.logger.log(`Verifying access to order ${orderId}`);
        
        try {
            const order = await this.orderRepository.findOne({
                where: { id: orderId },
                relations: ['customer'],
            });
            
            if (!order) {
                return false;
            }
            
            // Verify using various possible fields - email, phone number, last 4 digits of CC
            const possibleMatches = [
                order.customer?.email?.toLowerCase(),
                order.customer?.phoneNumber?.toLowerCase(),
                order.customerPhone?.toLowerCase(),
                // Add more fields as needed
            ].filter(Boolean); // Filter out undefined/null values
            
            const normalizedInput = verificationData.toLowerCase().trim();
            
            return possibleMatches.some(match => match === normalizedInput);
        } catch (error) {
            this.logger.error(`Error verifying order access: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Generate a tracking OTP for an order
     * @param orderId The order ID or order number
     * @param email Email to send the OTP to
     * @returns The generated OTP
     */
    async generateTrackingOTP(orderId: string | number, email: string): Promise<string> {
        // Verify the order exists
        let order;
        
        if (typeof orderId === 'number') {
            order = await this.orderRepository.findOne({
                where: { id: orderId },
                relations: ['customer'],
            });
        } else {
            order = await this.orderRepository.findOne({
                where: { orderNumber: orderId },
                relations: ['customer'],
            });
        }
        
        if (!order) {
            throw new NotFoundException(`Order with identifier ${orderId} not found`);
        }
        
        // Verify that this email is associated with the order
        // either as the customer email or the email provided during guest checkout
        let isValidEmail = false;
        
        if (order.customer?.email?.toLowerCase() === email.toLowerCase()) {
            isValidEmail = true;
        } else if (order.guestEmail?.toLowerCase() === email.toLowerCase()) {
            isValidEmail = true;
        }
        
        if (!isValidEmail) {
            throw new UnauthorizedException('Email is not associated with this order');
        }
        
        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP with a 15-minute expiry
        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 15);
        
        // Use order ID for consistent key (in case orderNumber was provided)
        const otpKey = `${order.id}-${email}`;
        this.otpStore.set(otpKey, {
            otp,
            expires: expiry
        });
        
        // Clean up expired OTPs occasionally
        this.cleanupExpiredOTPs();
        
        return otp;
    }
    
    /**
     * Verify a tracking OTP for an order
     * @param orderId The order ID or order number
     * @param email Email associated with the order
     * @param otp OTP to verify
     * @returns True if OTP is valid, false otherwise
     */
    async verifyTrackingOTP(orderId: string | number, email: string, otp: string): Promise<boolean> {
        let order;
        
        if (typeof orderId === 'number') {
            order = await this.orderRepository.findOne({
                where: { id: orderId }
            });
        } else {
            order = await this.orderRepository.findOne({
                where: { orderNumber: orderId }
            });
        }
        
        if (!order) {
            return false;
        }
        
        const otpKey = `${order.id}-${email}`;
        const storedData = this.otpStore.get(otpKey);
        
        if (!storedData) {
            return false;
        }
        
        // Check if OTP has expired
        if (storedData.expires < new Date()) {
            this.otpStore.delete(otpKey);
            return false;
        }
        
        // Check if OTP matches
        if (storedData.otp !== otp) {
            return false;
        }
        
        // OTP is valid, delete it after use
        this.otpStore.delete(otpKey);
        return true;
    }
    
    /**
     * Clean up expired OTPs
     */
    private cleanupExpiredOTPs(): void {
        const now = new Date();
        for (const [key, value] of this.otpStore.entries()) {
            if (value.expires < now) {
                this.otpStore.delete(key);
            }
        }
    }

    /**
     * Check if a user has permission to track an order
     * @param orderId Order ID to track
     * @param userId User ID (if authenticated)
     * @returns True if user has permission, false otherwise
     */
    async checkOrderTrackingPermission(orderId: number, userId?: number): Promise<boolean> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: ['customer'],
        });
        
        if (!order) {
            return false;
        }
        
        // If user is authenticated, check if they own the order
        if (userId && order.customer && order.customer.id === userId) {
            return true;
        }
        
        // For guests or users not owning the order, verification will be needed
        return false;
    }

    // Helper method to extract image URL from product
    private getProductImageUrl(product: any): string {
        // Default placeholder
        const placeholder = '/images/product-placeholder.jpg';
        
        // Check for additional_images field which might contain image URLs
        if (product.additional_images) {
            try {
                const images = JSON.parse(product.additional_images);
                if (Array.isArray(images) && images.length > 0) {
                    return images[0];
                }
            } catch (e) {
                this.logger.warn(`Error parsing additional_images for product ${product.id}: ${e.message}`);
            }
        }

        // Check for other possible image fields that might be available
        if (product.image_url) {
            return product.image_url;
        }
        
        if (product.thumbnail) {
            return product.thumbnail;
        }

        return placeholder;
    }
    
    private generateOrderActivities(order: Order) {
        const activities = [];
        const statuses = this.getOrderStatusSequence();
        const currentStatusIndex = statuses.findIndex(s => s.status === order.status);
        
        // Add all activities up to the current status
        for (let i = 0; i <= currentStatusIndex; i++) {
            const statusInfo = statuses[i];
            let timestamp = '';
            
            // Use actual timestamps for certain statuses if available
            if (statusInfo.status === OrderStatus.PENDING_APPROVAL) {
                timestamp = this.formatDate(order.orderDate);
            } else if (statusInfo.status === OrderStatus.APPROVED && order.approvalDate) {
                timestamp = this.formatDate(order.approvalDate);
            } else if (statusInfo.status === OrderStatus.SHIPPING && order.shippedAt) {
                timestamp = this.formatDate(order.shippedAt);
            } else if (statusInfo.status === OrderStatus.DELIVERED && order.deliveredAt) {
                timestamp = this.formatDate(order.deliveredAt);
            } else if (i < currentStatusIndex) {
                // For intermediate statuses without specific timestamps, estimate one
                timestamp = this.formatDate(this.estimateTimestampForStatus(order, i));
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
                message: 'Đơn hàng của bạn đã được xác nhận và đang được xử lý.',
            },
            {
                status: OrderStatus.PROCESSING,
                label: 'Đang đóng gói',
                message: 'Đơn hàng của bạn đang được đóng gói chuẩn bị giao cho đơn vị vận chuyển.',
            },
            {
                status: OrderStatus.SHIPPING,
                label: 'Đang vận chuyển',
                message: 'Đơn hàng đã được bàn giao cho đơn vị vận chuyển và đang trên đường giao hàng.',
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
            minute: '2-digit'
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
