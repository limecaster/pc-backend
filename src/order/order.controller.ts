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
    Query,
    BadRequestException,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderStatus } from './order.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { EmailService } from '../email/email.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('orders')
export class OrderController {
    private readonly logger = new Logger(OrderController.name);

    constructor(
        private readonly orderService: OrderService,
        private readonly emailService: EmailService,
    ) {}

    @Get(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    async getOrderById(@Param('id') id: string, @Request() req) {
        try {
            const order = await this.orderService.findOrderWithItems(
                parseInt(id),
            );

            if (!order) {
                this.logger.error(`Order with ID ${id} not found`);
                throw new NotFoundException(`Order with ID ${id} not found`);
            }

            const isPaymentVerification =
                req.query.paymentVerification === 'true';
            const isAuthenticated = req.user?.id;
            const isOwner =
                isAuthenticated && order.customerId === req.user?.id;
            const isStaffOrAdmin =
                req.user?.role === Role.STAFF || req.user?.role === Role.ADMIN;
            if (
                !isPaymentVerification &&
                (!isAuthenticated || (!isOwner && !isStaffOrAdmin))
            ) {
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
                    customerEmail:
                        order.customer?.email || (order as any).guestEmail,
                    customerPhone:
                        order.customer?.phoneNumber ||
                        (order as any).guestPhone ||
                        'Không có thông tin',
                    deliveryAddress:
                        order.deliveryAddress || 'Không có thông tin',
                    paymentMethod: order.paymentMethod || 'PayOS',
                    items:
                        order.items?.map((item) => ({
                            id: item.product?.id || 'unknown',
                            name: item.product?.name || 'Unknown Product',
                            price: (item as any).price || 0,
                            quantity: item.quantity || 0,
                            imageUrl:
                                (item.product as any)?.imageUrl ||
                                (item.product as any)?.images?.[0] ||
                                null,
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
            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                data.status,
                req.user.id,
            );

            if (data.status === OrderStatus.APPROVED) {
                const orderWithDetails =
                    await this.orderService.findOrderWithItems(
                        parseInt(orderId),
                    );
                const customerEmail =
                    orderWithDetails.customer?.email ||
                    orderWithDetails.guestEmail;

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
            const order = await this.orderService.findOrderWithItems(
                parseInt(orderId),
            );

            if (!order) {
                this.logger.error(`Order with ID ${orderId} not found`);
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

    @UseGuards(OptionalJwtAuthGuard)
    @Get('track/:identifier')
    async trackOrder(@Param('identifier') identifier: string, @Request() req) {
        try {
            // Check if user is authenticated (has valid JWT)
            const isAuthenticated = !!req.user;
            const userId = req.user?.id;

            // Find the order (can be by ID or order number)
            let order;
            const isNumeric = !isNaN(Number(identifier));

            if (isNumeric) {
                order = await this.orderService.getOrderTrackingInfo(
                    parseInt(identifier),
                    true,
                );
            } else {
                order = await this.orderService.getOrderTrackingInfo(
                    identifier,
                    true,
                );
            }

            if (!order) {
                return {
                    success: false,
                    message: `Không tìm thấy đơn hàng với mã ${identifier}`,
                };
            }

            // For authenticated users, check if they own the order
            const isOrderOwner = isAuthenticated
                ? await this.orderService.checkOrderTrackingPermission(
                      order.id,
                      userId,
                  )
                : false;

            // IMPORTANT: For non-authenticated users, always require verification
            if (!isAuthenticated || (isAuthenticated && !isOrderOwner)) {
                return {
                    success: true,
                    order: order,
                    requiresVerification: true,
                    isAuthenticated: isAuthenticated,
                    isOwner: false,
                };
            }

            // User is authenticated and owns the order - no verification needed
            const fullOrderData = await this.orderService.getOrderTrackingInfo(
                order.id,
                false,
            );
            return {
                success: true,
                order: fullOrderData,
                requiresVerification: false,
                isAuthenticated: true,
                isOwner: true,
            };
        } catch (error) {
            this.logger.error(`Error tracking order: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Error tracking order',
            };
        }
    }

    @Post('track/request-otp')
    async requestTrackingOTP(
        @Body() body: { orderNumber: string; email: string },
    ) {
        try {
            const { orderNumber, email } = body;

            if (!orderNumber || !email) {
                return {
                    success: false,
                    message: 'Order number and email are required',
                };
            }

            const otp = await this.orderService.generateTrackingOTP(
                orderNumber,
                email,
            );

            await this.emailService.sendOrderTrackingOTP(
                email,
                otp,
                orderNumber,
            );

            return {
                success: true,
                message: 'OTP sent successfully',
            };
        } catch (error) {
            this.logger.error(`Error requesting OTP: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Error requesting OTP',
            };
        }
    }

    // Update the alias endpoint to support both new and old formats
    @Post('track/send-otp')
    async sendTrackingOTP(
        @Body() body: { orderId?: string; orderNumber?: string; email: string },
    ) {
        // Handle both formats for backward compatibility
        const { orderId, orderNumber, email } = body;

        return this.requestTrackingOTP({
            orderNumber: orderNumber || orderId, // Use orderNumber if provided, fall back to orderId
            email,
        });
    }

    @Post('track/verify-otp')
    async verifyTrackingOTP(
        @Body() body: { orderNumber: string; email: string; otp: string },
    ) {
        try {
            const { orderNumber, email, otp } = body;

            if (!orderNumber || !email || !otp) {
                return {
                    success: false,
                    message: 'Order number, email, and OTP are required',
                };
            }

            const isValid = await this.orderService.verifyTrackingOTP(
                orderNumber,
                email,
                otp,
            );

            if (!isValid) {
                return {
                    success: false,
                    message: 'Invalid or expired OTP',
                };
            }

            // Get full order details
            const orderData = await this.orderService.getOrderTrackingInfo(
                orderNumber,
                false,
            );

            return {
                success: true,
                message: 'OTP verified successfully',
                order: orderData,
            };
        } catch (error) {
            this.logger.error(`Error verifying OTP: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Error verifying OTP',
            };
        }
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.STAFF)
    @Get('admin/all')
    async getAllOrders(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('status') status?: OrderStatus,
        @Query('search') search?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('sortBy') sortBy: string = 'orderDate',
        @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
    ) {
        try {
            const filters: any = {};

            if (status) {
                filters.status = status;
            }

            if (search) {
                filters.search = search;
            }

            if (startDate) {
                filters.startDate = new Date(startDate);
            }

            if (endDate) {
                filters.endDate = new Date(endDate);
            }

            const { orders, total, pages } =
                await this.orderService.findAllOrders({
                    page,
                    limit,
                    filters,
                    sortBy,
                    sortOrder,
                });

            return {
                success: true,
                orders,
                total,
                pages,
                currentPage: page,
            };
        } catch (error) {
            this.logger.error(`Error fetching all orders: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.STAFF)
    @Get('admin/customer/:id')
    async getOrdersByCustomerId(@Param('id') id: string) {
        try {
            const customerId = parseInt(id);
            if (isNaN(customerId)) {
                throw new BadRequestException('Invalid customer ID');
            }

            const orders =
                await this.orderService.findOrdersByCustomerId(customerId);

            // Format orders for admin display
            const formattedOrders = orders.map((order) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                orderDate: order.orderDate,
                status: order.status,
                total: order.total,
                subtotal: order.subtotal || order.total,
                discountAmount: order.discountAmount || 0,
                shippingFee: order.shippingFee || 0,
                paymentMethod: order.paymentMethod || 'PayOS',
                items: order.items?.length || 0,
            }));

            return {
                success: true,
                orders: formattedOrders,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching orders for customer ${id}: ${error.message}`,
            );
            return {
                success: false,
                message: error.message,
            };
        }
    }
}
