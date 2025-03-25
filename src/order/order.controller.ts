import {
    Controller,
    Get,
    Param,
    UseGuards,
    Request,
    NotFoundException,
    Logger,
    Patch,
    Body,
    Post,
    Inject,
    forwardRef,
    Query,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderStatus } from './order.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { CheckoutService } from '../checkout/checkout.service';
import { SendOTPDto, VerifyOTPDto } from './dto/track-order.dto';
import { EmailService } from '../email/email.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('orders')
export class OrderController {
    private readonly logger = new Logger(OrderController.name);

    constructor(
        private readonly orderService: OrderService,
        @Inject(forwardRef(() => CheckoutService))
        private readonly checkoutService: CheckoutService,
        private readonly emailService: EmailService,
    ) {}

    @Get(':id')
    async getOrderById(@Param('id') id: string, @Request() req) {
        try {
            const order = await this.orderService.findOrderWithItems(parseInt(id));

            if (!order) {
                this.logger.error(`Order with ID ${id} not found`);
                throw new NotFoundException(`Order with ID ${id} not found`);
            }

            const isPaymentVerification = req.query.paymentVerification === 'true';
            const isAuthenticated = req.user?.id;
            const isOwner = isAuthenticated && order.customerId === req.user?.id;
            const isStaffOrAdmin =
                req.user?.role === Role.STAFF || req.user?.role === Role.ADMIN;

            if (!isPaymentVerification && (!isAuthenticated || (!isOwner && !isStaffOrAdmin))) {
                return {
                    success: true,
                    order: {
                        id: order.id,
                        orderNumber: order.orderNumber,
                        orderDate: order.orderDate,
                        status: order.status,
                    },
                };
            }

            return {
                success: true,
                order: {
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
                        : (order as any).guestName || 'Không có thông tin',
                    customerEmail: order.customer?.email || (order as any).guestEmail,
                    customerPhone: order.customer?.phoneNumber || (order as any).guestPhone || 'Không có thông tin',
                    deliveryAddress: order.deliveryAddress || 'Không có thông tin',
                    items: order.items?.map(item => ({
                        id: item.product?.id || 'unknown',
                        name: item.product?.name || 'Unknown Product',
                        price: (item as any).price || 0,
                        quantity: item.quantity || 0,
                        imageUrl: (item.product as any)?.imageUrl || ((item.product as any)?.images?.[0]) || null,
                    })) || [],
                },
            };
        } catch (error) {
            this.logger.error(`Error fetching order: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('user/history')
    async getUserOrderHistory(@Request() req) {
        try {
            const customerId = req.user.id;
            const orders = await this.orderService.findOrdersByCustomerId(customerId);

            return {
                success: true,
                orders,
            };
        } catch (error) {
            this.logger.error(`Error fetching user order history: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.STAFF)
    @Get('admin/pending-approval')
    async getPendingApprovalOrders() {
        try {
            const orders = await this.orderService.findPendingApprovalOrders();

            return {
                success: true,
                orders,
            };
        } catch (error) {
            this.logger.error(`Error fetching pending orders: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.STAFF)
    @Patch(':id/status')
    async updateOrderStatus(
        @Param('id') orderId: string,
        @Body() data: { status: OrderStatus },
        @Request() req,
    ) {
        try {
            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                data.status,
                req.user.id,
            );

            if (data.status === OrderStatus.APPROVED) {
                const orderWithDetails = await this.orderService.findOrderWithItems(parseInt(orderId));
                const customerEmail = orderWithDetails.customer?.email || orderWithDetails.guestEmail;

                if (customerEmail) {
                    await this.emailService.sendOrderApprovalEmail(
                        customerEmail,
                        orderWithDetails.orderNumber,
                        orderWithDetails,
                    );
                }
            }

            return {
                success: true,
                order: updatedOrder,
            };
        } catch (error) {
            this.logger.error(`Error updating order status: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post(':id/cancel')
    async cancelOrder(@Param('id') orderId: string, @Request() req) {
        try {
            const order = await this.orderService.findOrderWithItems(parseInt(orderId));

            if (!order) {
                this.logger.error(`Order with ID ${orderId} not found`);
                throw new NotFoundException(`Order with ID ${orderId} not found`);
            }

            if (order.customerId !== req.user.id) {
                return {
                    success: false,
                    message: 'You do not have permission to cancel this order',
                };
            }

            if (![OrderStatus.PENDING_APPROVAL, OrderStatus.APPROVED].includes(order.status)) {
                return {
                    success: false,
                    message: 'This order cannot be cancelled',
                };
            }

            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                OrderStatus.CANCELLED,
            );

            return {
                success: true,
                order: updatedOrder,
            };
        } catch (error) {
            this.logger.error(`Error cancelling order: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post(':id/pay')
    async initiatePayment(@Param('id') orderId: string, @Request() req, @Body() body: any) {
        try {
            const order = await this.orderService.findOrderWithItems(parseInt(orderId));

            if (!order) {
                this.logger.error(`Order with ID ${orderId} not found`);
                throw new NotFoundException(`Order with ID ${orderId} not found`);
            }

            if (order.customerId !== req.user.id) {
                return {
                    success: false,
                    message: 'You do not have permission to pay for this order',
                };
            }

            if (order.status !== OrderStatus.APPROVED) {
                return {
                    success: false,
                    message: 'This order is not ready for payment',
                    status: order.status,
                };
            }

            const paymentData = {
                orderId: order.id.toString(),
                description: `Order #${order.id} Thanh toan B Store`,
                items: order.items.map((item) => ({
                    id: item.product.id,
                    name: item.product.name,
                    price: item.product.price,
                    quantity: item.quantity,
                })),
                customer: {
                    fullName: req.user.firstName + ' ' + req.user.lastName,
                    email: req.user.email,
                    phone: req.user.phoneNumber || '',
                    address: order.deliveryAddress,
                },
                total: order.total,
                subtotal: order.total,
                returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/success?orderId=${order.id}`,
                cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/failure?orderId=${order.id}`,
                webhookUrl: `${process.env.API_URL || 'http://localhost:5000'}/payment/webhook`,
                extraData: {
                    orderId: order.id.toString(),
                    customerEmail: req.user.email,
                },
            };

            const paymentResult = await this.checkoutService.processPayment(paymentData);

            return {
                success: true,
                data: paymentResult.data,
                message: 'Payment link created successfully',
            };
        } catch (error) {
            this.logger.error(`Error initiating payment: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

}
