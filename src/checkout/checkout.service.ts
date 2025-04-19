import {
    Injectable,
    Logger,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { GuestOrderDto } from './dto/guest-order.dto';
import { PaymentService } from '../payment/payment.service';
import { OrderService } from '../order/order.service';
import { OrderDto } from '../order/dto/order.dto';
import { Customer } from '../customer/customer.entity';
import { Product } from '../product/product.entity';
import { DiscountUsageService } from '../discount/services/discount-usage.service';

@Injectable()
export class CheckoutService {
    private readonly logger = new Logger(CheckoutService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,

        @Inject(PaymentService)
        private paymentService: PaymentService,

        @Inject(OrderService)
        private orderService: OrderService,

        @Inject(DiscountUsageService)
        private discountUsageService: DiscountUsageService,

        @Inject(DataSource)
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
            order.customerName =
                createOrderDto.customerName ||
                `${customer.firstname} ${customer.lastname}`.trim();
            order.customerPhone =
                createOrderDto.customerPhone || customer.phoneNumber;
            order.subtotal = createOrderDto.subtotal || createOrderDto.total;
            order.shippingFee = createOrderDto.shippingFee || 0;

            // Store notes if provided
            if (createOrderDto.notes) {
                // Use correct property name if available on the entity
                if ('notes' in order) {
                    order['notes'] = createOrderDto.notes;
                }
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

                // Initialize discount usage flag to false - we'll record usage later
                order.discountUsageRecorded = false;
            }

            const savedOrder = await queryRunner.manager.save(Order, order);

            // Create order items
            const orderItems: OrderItem[] = [];

            let discountByProduct = new Map<
                string,
                { discountId: string; discountType: string; amount: number }
            >();

            // If we have product-specific discounts, prepare a map
            if (
                createOrderDto.appliedProductDiscounts &&
                Object.keys(createOrderDto.appliedProductDiscounts).length > 0
            ) {
                for (const [productId, discountInfo] of Object.entries(
                    createOrderDto.appliedProductDiscounts,
                )) {
                    discountByProduct.set(productId, discountInfo);
                }
            }

            for (const item of createOrderDto.items) {
                // Fetch the actual product to verify it exists and get current stock
                const product = await queryRunner.manager.findOne(Product, {
                    where: { id: item.productId },
                });

                if (!product) {
                    throw new Error(
                        `Product with ID ${item.productId} not found`,
                    );
                }

                // Check if we have enough stock
                if (product.stockQuantity < item.quantity) {
                    throw new Error(
                        `Not enough stock for product ${product.name}. Available: ${product.stockQuantity}, Requested: ${item.quantity}`,
                    );
                }

                const orderItem = new OrderItem();
                orderItem.order = savedOrder;
                orderItem.product = product;
                orderItem.quantity = item.quantity;

                // Store original price and calculate final price after discounts
                orderItem.originalPrice = item.originalPrice || item.price;
                orderItem.price = item.price;
                orderItem.finalPrice = item.price;

                // Check if this product has a specific discount applied
                if (discountByProduct.has(item.productId)) {
                    const discountInfo = discountByProduct.get(item.productId);

                    // Link the discount to this order item for usage tracking
                    if (discountInfo.discountId) {
                        orderItem.discount = {
                            id: discountInfo.discountId,
                        } as any; // Use as any to simplify reference
                        orderItem.discountType =
                            discountInfo.discountType as any;
                        orderItem.discountAmount = discountInfo.amount || 0;
                    }
                }

                orderItems.push(orderItem);
            }

            await queryRunner.manager.save(OrderItem, orderItems);

            // Adjust inventory after saving all order items
            for (const item of orderItems) {
                // Decrease stock quantity of the product
                if (item.product) {
                    const product = item.product;
                    product.stockQuantity = Math.max(
                        0,
                        product.stockQuantity - item.quantity,
                    );
                    await queryRunner.manager.save(Product, product);

                    this.logger.log(
                        `Reduced stock for product ${product.id} (${product.name}) from ${product.stockQuantity + item.quantity} to ${product.stockQuantity}`,
                    );
                }
            }

            await queryRunner.commitTransaction();

            // After transaction completes, also record usage via service
            if (
                order.discountAmount &&
                order.discountAmount > 0 &&
                (order.manualDiscountId ||
                    (order.appliedDiscountIds &&
                        order.appliedDiscountIds.length > 0))
            ) {
                // Use the service to record discount usage
                await this.discountUsageService.recordDiscountUsage(
                    savedOrder.id,
                );
            }

            // Format and return the complete order with items
            return this.orderService.findOrderWithItems(savedOrder.id);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`CreateOrder error: ${error.message}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async createGuestOrder(guestOrderDto: GuestOrderDto): Promise<Order> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Create the order object
            const order = queryRunner.manager.create(Order, {
                customerName: guestOrderDto.customerName,
                customerPhone: guestOrderDto.customerPhone,
                guestEmail: guestOrderDto.email, // Store guest email
                total: guestOrderDto.totalAmount,
                subtotal: guestOrderDto.subtotal || guestOrderDto.totalAmount,
                shippingFee: guestOrderDto.shippingFee || 0,
                orderDate: new Date(),
                status: OrderStatus.PENDING_APPROVAL,
                paymentMethod: guestOrderDto.paymentMethod,
                deliveryAddress: guestOrderDto.deliveryAddress,
                orderNumber: `ORD-${Date.now()}`,
            });

            // Add discount information if provided
            if (
                guestOrderDto.discountAmount &&
                guestOrderDto.discountAmount > 0
            ) {
                order.discountAmount = guestOrderDto.discountAmount;

                // Store manual discount ID if provided
                if (guestOrderDto.manualDiscountId) {
                    order.manualDiscountId = guestOrderDto.manualDiscountId;
                }
                // Store automatic discount IDs if provided
                else if (
                    guestOrderDto.appliedDiscountIds &&
                    guestOrderDto.appliedDiscountIds.length > 0
                ) {
                    order.appliedDiscountIds = guestOrderDto.appliedDiscountIds;
                }

                // Initialize discount usage flag
                order.discountUsageRecorded = false;
            }

            // Save the order using transaction
            const savedOrder = await queryRunner.manager.save(Order, order);

            // Create order items with proper relationship handling
            const orderItems: OrderItem[] = [];

            let discountByProduct = new Map<
                string,
                { discountId: string; discountType: string; amount: number }
            >();

            // If we have product-specific discounts, prepare a map
            if (
                guestOrderDto.appliedProductDiscounts &&
                Object.keys(guestOrderDto.appliedProductDiscounts).length > 0
            ) {
                for (const [productId, discountInfo] of Object.entries(
                    guestOrderDto.appliedProductDiscounts,
                )) {
                    discountByProduct.set(productId, discountInfo);
                }
            }

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

                // Check if we have enough stock
                if (product.stockQuantity < item.quantity) {
                    throw new Error(
                        `Not enough stock for product ${product.name}. Available: ${product.stockQuantity}, Requested: ${item.quantity}`,
                    );
                }

                // Create order item with proper product reference
                const orderItem = new OrderItem();
                orderItem.order = savedOrder;
                orderItem.product = product; // Use the full product entity
                orderItem.quantity = item.quantity;
                orderItem.price = item.price;
                orderItem.originalPrice = item.originalPrice || item.price;
                orderItem.finalPrice = item.price;

                // Check if this product has a specific discount applied
                if (discountByProduct.has(item.productId)) {
                    const discountInfo = discountByProduct.get(item.productId);

                    // Link the discount to this order item for usage tracking
                    if (discountInfo.discountId) {
                        orderItem.discount = {
                            id: discountInfo.discountId,
                        } as any; // Use as any to simplify reference
                        orderItem.discountType =
                            discountInfo.discountType as any;
                        orderItem.discountAmount = discountInfo.amount || 0;
                    }
                }

                orderItems.push(orderItem);
            }

            // Save all order items within the transaction
            await queryRunner.manager.save(OrderItem, orderItems);

            // Adjust inventory after saving all order items
            for (const item of orderItems) {
                // Decrease stock quantity of the product
                if (item.product) {
                    const product = item.product;
                    product.stockQuantity = Math.max(
                        0,
                        product.stockQuantity - item.quantity,
                    );
                    await queryRunner.manager.save(Product, product);

                    this.logger.log(
                        `Reduced stock for product ${product.id} (${product.name}) from ${product.stockQuantity + item.quantity} to ${product.stockQuantity}`,
                    );
                }
            }

            // Commit transaction
            await queryRunner.commitTransaction();

            // After transaction completes, also record usage via service
            if (
                order.discountAmount &&
                order.discountAmount > 0 &&
                (order.manualDiscountId ||
                    (order.appliedDiscountIds &&
                        order.appliedDiscountIds.length > 0))
            ) {
                // Use the service to record discount usage
                await this.discountUsageService.recordDiscountUsage(
                    savedOrder.id,
                );
            }

            return savedOrder;
        } catch (error) {
            // Rollback transaction on error
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
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
