import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Order, OrderStatus } from '../order.entity';
import { OrderInventoryService } from './order-inventory.service';

@Injectable()
export class OrderStatusService {
    private readonly logger = new Logger(OrderStatusService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,
        private orderInventoryService: OrderInventoryService,
    ) {}

    /**
     * Update an order's status with proper validation
     */
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
        
        const previousStatus = order.status;
        
        // Validate status transitions
        await this.validateStatusTransition(order.status, status, staffId);

        // Handle stock adjustment based on status change
        if (status === OrderStatus.APPROVED && previousStatus === OrderStatus.PENDING_APPROVAL) {
            // When order is approved, reduce product stock
            await this.orderInventoryService.adjustInventoryForOrder(orderId, 'decrease');
            this.logger.log(`Decreased stock for products in order ${orderId}`);
        } 
        else if (status === OrderStatus.CANCELLED && 
                (previousStatus === OrderStatus.APPROVED || previousStatus === OrderStatus.PAYMENT_SUCCESS)) {
            // When approved order is cancelled, restore product stock
            await this.orderInventoryService.adjustInventoryForOrder(orderId, 'increase');
            this.logger.log(`Restored stock for products in order ${orderId}`);
        }

        order.status = status;

        // Handle specific status-related actions
        if (status === OrderStatus.APPROVED && staffId) {
            order.approvedBy = staffId;
            order.approvalDate = new Date();
        } else if (status === OrderStatus.DELIVERED) {
            order.receiveDate = new Date();
        }

        return await this.orderRepository.save(order);
    }

    /**
     * Validate whether a status transition is allowed
     */
    async validateStatusTransition(
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

    /**
     * Scheduled task to automatically update shipping orders to delivered
     */
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

    /**
     * Find orders that need staff approval
     */
    async findPendingApprovalOrders(): Promise<Order[]> {
        return await this.orderRepository.find({
            where: { status: OrderStatus.PENDING_APPROVAL },
            relations: ['customer'],
            order: { orderDate: 'DESC' },
        });
    }
}
