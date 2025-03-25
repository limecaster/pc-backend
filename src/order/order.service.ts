import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, MoreThan } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
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
        
        private orderTrackingService: OrderTrackingService,
        private orderStatusService: OrderStatusService,
        private orderInventoryService: OrderInventoryService,
        private orderDisplayService: OrderDisplayService,
    ) {}

    async findOrderWithItems(id: number): Promise<OrderDto> {
        const order = await this.orderRepository.findOne({
            where: { id },
            relations: ['customer'],
        });

        if (!order) {
            this.logger.error(`Order with ID ${id} not found`);
            return null;
        }

        const items = await this.orderItemRepository.find({
            where: { order: { id: order.id } },
            relations: ['product'],
        });

        const orderDto: OrderDto = {
            ...order,
            items,
            customerId: order.customer?.id,
        };

        return orderDto;
    }

    async findOrderByNumber(orderNumber: string): Promise<OrderDto> {
        const order = await this.orderRepository.findOne({
            where: { orderNumber },
            relations: ['customer'],
        });

        if (!order) {
            this.logger.error(`Order with number ${orderNumber} not found`);
            return null;
        }

        const items = await this.orderItemRepository.find({
            where: { order: { id: order.id } },
            relations: ['product'],
        });

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
            this.logger.error(`No orders found for customer ID ${customerId}`);
            return [];
        }

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
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
            const currentOrder = await this.orderRepository.findOne({ where: { id: orderId } });
            if (!currentOrder) {
                this.logger.error(`Cannot update status: Order ${orderId} not found`);
                throw new NotFoundException(`Order with ID ${orderId} not found`);
            }

            const order = await this.orderStatusService.updateOrderStatus(orderId, status, staffId);
            await queryRunner.manager.save(Order, order);
            await queryRunner.commitTransaction();

            return order;
        } catch (error) {
            this.logger.error(`Error updating order status for order ${orderId}: ${error.message}`);
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async findPendingApprovalOrders(): Promise<OrderDto[]> {
        const orders = await this.orderStatusService.findPendingApprovalOrders();

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
        try {
            await this.orderStatusService.updateShippingOrdersToDelivered(daysInTransit);
        } catch (error) {
            this.logger.error(`Error updating shipping orders to delivered: ${error.message}`);
            throw error;
        }
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

    async markDiscountUsageRecorded(orderId: number): Promise<Order> {
        const order = await this.orderRepository.findOne({ where: { id: orderId }});
        
        if (!order) {
            this.logger.error(`Order with ID ${orderId} not found`);
            throw new NotFoundException(`Order with ID ${orderId} not found`);
        }
        
        order.discountUsageRecorded = true;
        return await this.orderRepository.save(order);
    }

    async findMostRecentPendingPayment(): Promise<Order | null> {
        try {
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
