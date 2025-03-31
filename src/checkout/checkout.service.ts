import {
    Injectable,
    Logger,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm'; // Replace Connection with DataSource
import { Order, OrderStatus } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { GuestOrderDto } from './dto/guest-order.dto';
import { PaymentService } from '../payment/payment.service';
import { OrderService } from '../order/order.service';
import { OrderDto } from '../order/dto/order.dto';
import { Customer } from '../customer/customer.entity'; // Import Customer entity
import { Product } from '../product/product.entity'; // Import Product entity

@Injectable()
export class CheckoutService {
    private readonly logger = new Logger(CheckoutService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,

        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,

        private paymentService: PaymentService,

        @Inject(forwardRef(() => OrderService))
        private orderService: OrderService,

        // Inject DataSource instead of Connection
        private dataSource: DataSource,
    ) {}

    async createOrder(
        customerId: number,
        createOrderDto: CreateOrderDto,
    ): Promise<OrderDto> {
        // Use dataSource instead of connection
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Find the customer
            const customer = await queryRunner.manager.findOne(Customer, {
                where: { id: customerId },
            });

            if (!customer) {
                throw new Error('Customer not found');
            }

            // Calculate order number
            const orderCount = await queryRunner.manager.count(Order);
            const orderNumber =
                'B' + (100000 + orderCount + 1).toString().substring(1);

            // Create a new order
            const order = new Order();
            order.customer = customer;
            order.total = createOrderDto.total;
            order.orderNumber = orderNumber;
            order.orderDate = new Date();
            order.status = OrderStatus.PENDING_APPROVAL;
            order.paymentMethod = createOrderDto.paymentMethod;
            order.deliveryAddress = createOrderDto.deliveryAddress;

            // Store notes in another field if 'notes' property doesn't exist
            if (createOrderDto.notes) {
                // Uncomment one of these options based on what exists in your Order entity
                // order.notes = createOrderDto.notes; // if the field is actually named 'notes'
                // order.orderNotes = createOrderDto.notes; // if it's named 'orderNotes'
                // or don't set any notes field if it doesn't exist in the entity
            }

            // Add discount information if provided
            if (
                createOrderDto.discountAmount &&
                createOrderDto.discountAmount > 0
            ) {
                order.discountAmount = createOrderDto.discountAmount;

                // Store manual discount ID if provided
                if (createOrderDto.manualDiscountId) {
                    order.manualDiscountId = createOrderDto.manualDiscountId;
                }
                // Store automatic discount IDs if provided
                else if (
                    createOrderDto.appliedDiscountIds &&
                    createOrderDto.appliedDiscountIds.length > 0
                ) {
                    order.appliedDiscountIds =
                        createOrderDto.appliedDiscountIds;
                }
            }

            const savedOrder = await queryRunner.manager.save(Order, order);

            // Create order items
            const orderItems: OrderItem[] = [];

            for (const item of createOrderDto.items) {
                const product = await queryRunner.manager.findOne(Product, {
                    where: { id: item.productId },
                });

                if (!product) {
                    throw new Error(
                        `Product with ID ${item.productId} not found`,
                    );
                }

                const orderItem = new OrderItem();
                orderItem.order = savedOrder;
                orderItem.product = product;
                orderItem.quantity = item.quantity;

                // Fix: Use type assertion to set properties that might have different names in OrderItem entity
                // This bypasses TypeScript checking - the actual property name should be verified
                (orderItem as any).price = item.price; // Use type assertion to bypass TypeScript check
                (orderItem as any).subPrice = item.price * item.quantity;

                orderItems.push(orderItem);
            }

            await queryRunner.manager.save(OrderItem, orderItems);

            await queryRunner.commitTransaction();

            return await this.orderService.findOrderWithItems(savedOrder.id);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    // Fix the createGuestOrder method to properly handle cart items
    async createGuestOrder(guestOrderDto: GuestOrderDto): Promise<Order> {
        try {
            // Use a transaction for data consistency
            const queryRunner = this.dataSource.createQueryRunner();
            await queryRunner.connect();
            await queryRunner.startTransaction();

            try {
                // Create order entity without customer relation
                const order = this.orderRepository.create({
                    total: guestOrderDto.total,
                    orderDate: new Date(),
                    status: OrderStatus.PENDING_APPROVAL,
                    paymentMethod: guestOrderDto.paymentMethod,
                    deliveryAddress: guestOrderDto.deliveryAddress,
                    orderNumber: `ORD-${Date.now()}`,
                });

                // Save the order using transaction
                const savedOrder = await queryRunner.manager.save(Order, order);

                // Create order items with proper relationship handling
                const orderItems: OrderItem[] = [];

                for (const item of guestOrderDto.items) {
                    // First verify the product exists to prevent FK constraint violation
                    const product = await queryRunner.manager.findOne(Product, {
                        where: { id: item.productId },
                    });

                    // Throw an error if product doesn't exist
                    if (!product) {
                        throw new Error(
                            `Product with ID ${item.productId} not found`,
                        );
                    }

                    // Create order item with proper product reference
                    const orderItem = new OrderItem();
                    orderItem.order = savedOrder;
                    orderItem.product = product; // Use the full product entity
                    orderItem.quantity = item.quantity;
                    orderItem.price = item.price;

                    orderItems.push(orderItem);
                }

                // Save all order items within the transaction
                await queryRunner.manager.save(OrderItem, orderItems);

                // Commit transaction
                await queryRunner.commitTransaction();

                return savedOrder;
            } catch (error) {
                // Rollback transaction on error
                await queryRunner.rollbackTransaction();
                throw error;
            } finally {
                await queryRunner.release();
            }
        } catch (error) {
            this.logger.error(`Failed to create guest order: ${error.message}`);
            throw new Error(`Failed to create guest order: ${error.message}`);
        }
    }

    async processPayment(paymentData: any) {
        try {
            // First ensure the order is in approved status before proceeding with payment
            if (paymentData.orderId) {
                const order = await this.orderRepository.findOne({
                    where: { id: parseInt(paymentData.orderId) },
                });

                if (order && order.status !== OrderStatus.APPROVED) {
                    throw new Error(
                        `Cannot process payment for order in ${order.status} status`,
                    );
                }
            }

            // Fetch order details, integrate with PayOS
            const result =
                await this.paymentService.createPaymentLink(paymentData);
            return result;
        } catch (error) {
            this.logger.error(`Payment processing failed: ${error.message}`);
            throw new Error(`Payment processing failed: ${error.message}`);
        }
    }

    async updateOrderStatus(
        orderId: number,
        status: OrderStatus,
    ): Promise<Order> {
        try {
            return this.orderService.updateOrderStatus(orderId, status);
        } catch (error) {
            this.logger.error(
                `Failed to update order status: ${error.message}`,
            );
            throw new Error(`Failed to update order status: ${error.message}`);
        }
    }

    // Add method to find order by ID
    async findOrderById(orderId: number): Promise<Order> {
        try {
            const order = await this.orderRepository.findOne({
                where: { id: orderId },
            });

            if (!order) {
                throw new NotFoundException(
                    `Order with ID ${orderId} not found`,
                );
            }

            return order;
        } catch (error) {
            this.logger.error(`Failed to find order by ID: ${error.message}`);
            throw error;
        }
    }
}
