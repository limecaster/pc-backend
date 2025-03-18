import {
    Injectable,
    Logger,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { GuestOrderDto } from './dto/guest-order.dto';
import { PaymentService } from '../payment/payment.service';
import { OrderService } from '../order/order.service';
import { OrderDto } from '../order/dto/order.dto';

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
    ) {}

    async createOrder(
        customerId: number,
        createOrderDto: CreateOrderDto,
    ): Promise<OrderDto> {
        try {
            // Create order entity with pending_approval status
            const order = this.orderRepository.create({
                customer: { id: customerId },
                total: createOrderDto.total,
                orderDate: new Date(),
                status: OrderStatus.PENDING_APPROVAL, // Initial status is pending approval
                paymentMethod: createOrderDto.paymentMethod,
                deliveryAddress: createOrderDto.deliveryAddress,
                orderNumber: `ORD-${Date.now()}`, // Generate unique order number
            });

            // Save the order to get an ID
            const savedOrder = await this.orderRepository.save(order);

            // Create order items
            const orderItems = createOrderDto.items.map((item) => {
                const orderItem = new OrderItem();
                orderItem.order = savedOrder;
                orderItem.product = { id: item.productId } as any;
                orderItem.quantity = item.quantity;
                orderItem.subPrice = item.price * item.quantity;
                return orderItem;
            });

            // Save all order items
            await this.orderItemRepository.save(orderItems);

            // Return complete order
            return this.orderService.findOrderWithItems(savedOrder.id);
        } catch (error) {
            this.logger.error(`Failed to create order: ${error.message}`);
            throw new Error(`Failed to create order: ${error.message}`);
        }
    }

    async createGuestOrder(guestOrderDto: GuestOrderDto): Promise<Order> {
        try {
            // Create order entity without customer relation
            const order = this.orderRepository.create({
                total: guestOrderDto.total,
                orderDate: new Date(),
                status: OrderStatus.PENDING_APPROVAL, // Initial status is pending approval
                paymentMethod: guestOrderDto.paymentMethod,
                deliveryAddress: guestOrderDto.deliveryAddress,
                orderNumber: `ORD-${Date.now()}`, // Generate unique order number
            });

            // Save the order to get an ID
            const savedOrder = await this.orderRepository.save(order);

            // Create order items
            const orderItems = guestOrderDto.items.map((item) => {
                const orderItem = new OrderItem();
                orderItem.order = savedOrder;
                orderItem.product = { id: item.productId } as any;
                orderItem.quantity = item.quantity;
                orderItem.subPrice = item.price * item.quantity;
                return orderItem;
            });

            // Save all order items
            await this.orderItemRepository.save(orderItems);

            return savedOrder;
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
