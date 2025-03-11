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
} from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderStatus } from './order.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { CheckoutService } from '../checkout/checkout.service';

@Controller('orders')
export class OrderController {
    private readonly logger = new Logger(OrderController.name);

    constructor(
        private readonly orderService: OrderService,
        @Inject(forwardRef(() => CheckoutService)) private readonly checkoutService: CheckoutService,
    ) {}

    @Get(':id')
    async getOrderById(@Param('id') id: string, @Request() req) {
        try {
            this.logger.log(`Fetching order with ID: ${id}`);
            const order = await this.orderService.findOrderWithItems(
                parseInt(id),
            );

            if (!order) {
                throw new NotFoundException(`Order with ID ${id} not found`);
            }

            // Check if user is authenticated and is the owner of this order
            // If not, we'll return limited information for public access
            const isAuthenticated = req.user?.id;
            const isOwner = isAuthenticated && order.customerId === req.user.id;
            const isStaffOrAdmin = req.user?.role === Role.STAFF || req.user?.role === Role.ADMIN;

            // If not authenticated or not the order owner, return only basic info
            if (!isAuthenticated || (!isOwner && !isStaffOrAdmin)) {
                this.logger.log(`Public access to order ${id} - returning limited information`);
                
                // Only return public order info
                const publicOrderInfo = {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    orderDate: order.orderDate,
                    status: order.status,
                    // Include only essential fields needed for public display
                };
                
                return {
                    success: true,
                    order: publicOrderInfo,
                };
            }

            // Full access for authenticated owner or staff/admin
            return {
                success: true,
                order,
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
            this.logger.log(
                `Fetching order history for user ID: ${customerId}`,
            );

            const orders =
                await this.orderService.findOrdersByCustomerId(customerId);

            return {
                success: true,
                orders,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching user order history: ${error.message}`,
            );
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
            this.logger.log(`Fetching orders pending approval`);
            const orders = await this.orderService.findPendingApprovalOrders();

            return {
                success: true,
                orders,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching pending orders: ${error.message}`,
            );
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
            this.logger.log(
                `Staff ${req.user.id} updating order ${orderId} status to ${data.status}`,
            );

            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                data.status,
                req.user.id,
            );

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
            // First check if the order belongs to the current user
            const order = await this.orderService.findOrderWithItems(
                parseInt(orderId),
            );

            if (!order) {
                throw new NotFoundException(
                    `Order with ID ${orderId} not found`,
                );
            }

            if (order.customerId !== req.user.id) {
                return {
                    success: false,
                    message: 'You do not have permission to cancel this order',
                };
            }

            // Only pending_approval or approved orders can be cancelled by customers
            if (
                ![OrderStatus.PENDING_APPROVAL, OrderStatus.APPROVED].includes(
                    order.status,
                )
            ) {
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
    async initiatePayment(@Param('id') orderId: string, @Request() req) {
        try {
            // First check if the order belongs to the current user
            const order = await this.orderService.findOrderWithItems(
                parseInt(orderId),
            );

            if (!order) {
                throw new NotFoundException(
                    `Order with ID ${orderId} not found`,
                );
            }

            if (order.customerId !== req.user.id) {
                return {
                    success: false,
                    message: 'You do not have permission to pay for this order',
                };
            }

            // Only approved orders can be paid
            if (order.status !== OrderStatus.APPROVED) {
                return {
                    success: false,
                    message: 'This order is not ready for payment',
                    status: order.status,
                };
            }

            // Generate payment data
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
                cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/failure`,
            };

            // Create payment link
            const paymentResult =
                await this.checkoutService.processPayment(paymentData);

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
