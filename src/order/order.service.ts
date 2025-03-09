import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderDto } from './dto/order.dto';

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);

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
}
