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

    // Update to prioritize orderNumber over id
    async getOrderTrackingInfo(identifier: string | number, limitedInfo: boolean = false) {
        // Try to find by orderNumber first (most user-friendly approach)
        let order;
        
        if (typeof identifier === 'string' && isNaN(Number(identifier))) {
            // This is definitely an order number (non-numeric string)
           
            order = await this.orderDisplayService.getOrderTrackingInfo(identifier, limitedInfo);
            console.log(order);
        } else {
            // This might be an ID or a numeric orderNumber
            // Try orderNumber first
            
            order = await this.orderDisplayService.getOrderTrackingInfo(identifier.toString(), limitedInfo);
            
            // If not found, try by ID as a fallback for backward compatibility
            if (!order && (typeof identifier === 'number' || !isNaN(Number(identifier)))) {
                
                order = await this.orderDisplayService.getOrderTrackingInfoById(Number(identifier), limitedInfo);
            }
        }
        
        return order;
    }

    async verifyOrderAccess(orderId: number, verificationData: string): Promise<boolean> {
        return this.orderTrackingService.verifyOrderAccess(orderId, verificationData);
    }

    async generateTrackingOTP(identifier: string | number, email: string): Promise<string> {
        return this.orderTrackingService.generateTrackingOTP(identifier, email);
    }

    async verifyTrackingOTP(identifier: string | number, email: string, otp: string): Promise<boolean> {
        return this.orderTrackingService.verifyTrackingOTP(identifier, email, otp);
    }

    // Update to work with order numbers
    async checkOrderTrackingPermission(identifier: string | number, userId?: number): Promise<boolean> {
        return this.orderTrackingService.checkOrderTrackingPermission(identifier, userId);
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

    /**
     * Find all orders with pagination, filtering and sorting
     */
    async findAllOrders({
        page = 1,
        limit = 10,
        filters = {},
        sortBy = 'orderDate',
        sortOrder = 'DESC',
    }: {
        page: number;
        limit: number;
        filters?: any;
        sortBy?: string;
        sortOrder?: 'ASC' | 'DESC';
    }) {
        try {
            // Start building the query
            let query = this.orderRepository
                .createQueryBuilder('order')
                .leftJoinAndSelect('order.customer', 'customer')
                .leftJoinAndSelect('order.items', 'items')
                .leftJoinAndSelect('items.product', 'product');

            // Apply filters
            if (filters.status) {
                query = query.andWhere('order.status = :status', { status: filters.status });
            }

            // Fix: Search by order number or customer name using individual conditions
            if (filters.search) {
                const searchTerm = `%${filters.search}%`;
                query = query.andWhere(
                    '("order"."order_number" ILIKE :searchTerm OR ' +
                    'LOWER("customer"."firstname") LIKE LOWER(:searchTerm) OR ' +
                    'LOWER("customer"."lastname") LIKE LOWER(:searchTerm) OR ' +
                    'LOWER(CONCAT("customer"."firstname", \' \', "customer"."lastname")) LIKE LOWER(:searchTerm) OR ' +
                    '"customer"."email" ILIKE :searchTerm OR ' +
                    '"customer"."phone_number" LIKE :searchTerm )',
                    { searchTerm }
                );
            }

            // Date range filters
            if (filters.startDate) {
                query = query.andWhere('order.orderDate >= :startDate', { 
                    startDate: filters.startDate 
                });
            }

            if (filters.endDate) {
                // Add 1 day to include the end date fully
                const endDate = new Date(filters.endDate);
                endDate.setDate(endDate.getDate() + 1);
                
                query = query.andWhere('order.orderDate < :endDate', { 
                    endDate: endDate
                });
            }

            // Get total count for pagination
            const total = await query.getCount();
            
            // Apply sorting with proper TypeORM syntax
            if (sortBy && sortOrder) {
                // Handle some special cases - most sorting will be on order table
                if (sortBy === 'customerName') {
                    query = query.orderBy('CONCAT(customer.firstname, \' \', customer.lastname)', sortOrder);
                } else {
                    // Use the TypeORM alias syntax without manual quoting
                    query = query.orderBy(`order.${sortBy}`, sortOrder);
                }
            }

            // Apply pagination
            const skip = (page - 1) * limit;
            query = query.skip(skip).take(limit);

            // Execute query
            const orders = await query.getMany();

            // Calculate total pages
            const pages = Math.ceil(total / limit);

            // Map to DTO format
            const mappedOrders = orders.map(order => {
                return {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    orderDate: order.orderDate,
                    status: order.status,
                    total: order.total,
                    subtotal: order.subtotal || order.total,
                    discountAmount: order.discountAmount || 0,
                    shippingFee: order.shippingFee || 0,
                    customerName: order.customer
                        ? `${order.customer.firstname || ''} ${order.customer.lastname || ''}`
                        : 'Không có thông tin',
                    customerEmail: order.customer?.email || order.guestEmail,
                    customerPhone: order.customer?.phoneNumber  || 'Không có thông tin',
                    deliveryAddress: order.deliveryAddress || 'Không có thông tin',
                    paymentMethod: order.paymentMethod || 'PayOS',
                    items: order.items?.map(item => ({
                        id: item.product?.id || 'unknown',
                        name: item.product?.name || 'Unknown Product',
                        price: item.price || 0,
                        quantity: item.quantity || 0,
                        imageUrl: item.product?.imageUrl || 'image/image-placeholder.webp',
                    })) || [],
                };
            });

            return {
                orders: mappedOrders,
                total,
                pages,
            };
        } catch (error) {
            this.logger.error(`Error finding all orders: ${error.message}`);
            throw new Error(`Failed to find all orders: ${error.message}`);
        }
    }
}
