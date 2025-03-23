import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, MoreThan } from 'typeorm';
import { Order, OrderStatus } from './order.entity'; // Fixed: Import OrderStatus from order.entity
import { OrderItem } from './order-item.entity';
import { OrderDto } from './dto/order.dto';
import { OrderTrackingService } from './services/order-tracking.service';
import { OrderStatusService } from './services/order-status.service';
import { OrderInventoryService } from './services/order-inventory.service';
import { OrderDisplayService } from './services/order-display.service';

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,

        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,

        private connection: Connection,
        
        // Inject specialized services
        private orderTrackingService: OrderTrackingService,
        private orderStatusService: OrderStatusService,
        private orderInventoryService: OrderInventoryService,
        private orderDisplayService: OrderDisplayService,
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

    async updateOrderStatus(orderId: number, status, staffId?: number): Promise<Order> {
        // Use a transaction to ensure data consistency
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
            this.logger.log(`Updating order ${orderId} status to ${status}`);
            
            // Get the current order to validate
            const currentOrder = await this.orderRepository.findOne({ where: { id: orderId } });
            if (!currentOrder) {
                this.logger.error(`Cannot update status: Order ${orderId} not found`);
                throw new NotFoundException(`Order with ID ${orderId} not found`);
            }
            
            this.logger.log(`Current order ${orderId} status: ${currentOrder.status}`);
            
            // Delegate to OrderStatusService, with transaction support
            const order = await this.orderStatusService.updateOrderStatus(orderId, status, staffId);
            
            this.logger.log(`Order status updated in memory, saving to database...`);
            await queryRunner.manager.save(Order, order);
            
            this.logger.log(`Committing transaction...`);
            await queryRunner.commitTransaction();
            
            this.logger.log(`Order ${orderId} successfully updated to status ${status}`);
            return order;
        } catch (error) {
            this.logger.error(`Error updating order status: ${error.message}`);
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async findPendingApprovalOrders(): Promise<OrderDto[]> {
        const orders = await this.orderStatusService.findPendingApprovalOrders();
        
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

    async updateShippingOrdersToDelivered(daysInTransit: number = 3): Promise<void> {
        return this.orderStatusService.updateShippingOrdersToDelivered(daysInTransit);
    }

    async getOrderTrackingInfo(orderId: number | string, limitedInfo: boolean = false) {
        return this.orderDisplayService.getOrderTrackingInfo(orderId, limitedInfo);
    }

    async verifyOrderAccess(orderId: number, verificationData: string): Promise<boolean> {
        return this.orderTrackingService.verifyOrderAccess(orderId, verificationData);
    }

    async generateTrackingOTP(orderId: string | number, email: string): Promise<string> {
        return this.orderTrackingService.generateTrackingOTP(orderId, email);
    }

    async verifyTrackingOTP(orderId: string | number, email: string, otp: string): Promise<boolean> {
        return this.orderTrackingService.verifyTrackingOTP(orderId, email, otp);
    }

    async checkOrderTrackingPermission(orderId: number, userId?: number): Promise<boolean> {
        return this.orderTrackingService.checkOrderTrackingPermission(orderId, userId);
    }

    /**
     * Mark discount usage as recorded for an order to prevent duplicate counting
     * @param orderId The order ID
     * @returns The updated order
     */
    async markDiscountUsageRecorded(orderId: number): Promise<Order> {
        const order = await this.orderRepository.findOne({ where: { id: orderId }});
        
        if (!order) {
            throw new NotFoundException(`Order with ID ${orderId} not found`);
        }
        
        order.discountUsageRecorded = true;
        return await this.orderRepository.save(order);
    }

    /**
     * Find the most recent order that's pending payment
     * This is a fallback method for associating payments with orders
     */
    async findMostRecentPendingPayment(): Promise<Order | null> {
        try {
            // Find the most recent APPROVED order that hasn't been paid yet
            // Limit to orders created in the last hour to avoid incorrect associations
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            const order = await this.orderRepository.findOne({
                where: {
                    status: OrderStatus.APPROVED,
                    createdAt: MoreThan(oneHourAgo),
                },
                order: {
                    createdAt: 'DESC',
                },
            });
            
            return order;
        } catch (error) {
            this.logger.error(`Error finding recent pending payment: ${error.message}`);
            return null;
        }
    }
}
