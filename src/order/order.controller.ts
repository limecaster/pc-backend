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
    // Track recent requests to detect duplicates
    private recentRequests = new Map<string, number>();
    // Rate limiting for OTP requests
    private otpAttempts = new Map<
        string,
        { count: number; lastAttempt: number }
    >();

    constructor(
        private readonly orderService: OrderService,
        @Inject(forwardRef(() => CheckoutService))
        private readonly checkoutService: CheckoutService,
        private readonly emailService: EmailService,
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
            const isStaffOrAdmin =
                req.user?.role === Role.STAFF || req.user?.role === Role.ADMIN;

            // If not authenticated or not the order owner, return only basic info
            if (!isAuthenticated || (!isOwner && !isStaffOrAdmin)) {
                this.logger.log(
                    `Public access to order ${id} - returning limited information`,
                );

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

    /**
     * Track order with authentication (JWT or OTP)
     * Returns different levels of detail based on authentication
     */
    @UseGuards(OptionalJwtAuthGuard)
    @Get('track/:identifier')
    async trackOrder(
        @Param('identifier') identifier: string,
        @Request() req,
        @Query('email') email?: string,
    ) {
        const clientIp = req.ip || 'unknown';
        const requestId = `${clientIp}-track-${identifier}`;
        const now = Date.now();

        // Check for duplicate requests
        if (this.recentRequests.has(requestId)) {
            const timestamp = this.recentRequests.get(requestId);
            if (now - timestamp < 2000) {
                this.logger.warn(
                    `Potential duplicate request detected for order ${identifier} from IP ${clientIp}`,
                );
            }
        }

        // Record this request
        this.recentRequests.set(requestId, now);
        this.cleanupOldRequests();

        try {
            // Identify the request source
            const isAuthenticated = !!req.user;
            this.logger.log(
                `Tracking order ${identifier}, User authenticated: ${isAuthenticated}, Email provided: ${!!email}`,
            );

            // Check if identifier is a numeric ID or an order number
            let order;
            const isNumericId = /^\d+$/.test(identifier);

            if (isNumericId) {
                // If it's a numeric ID, find order by ID
                order = await this.orderService.findOrderWithItems(
                    parseInt(identifier),
                );
            } else {
                // Otherwise treat it as an order number
                order = await this.orderService.findOrderByNumber(identifier);
            }

            if (!order) {
                throw new NotFoundException(`Order ${identifier} not found`);
            }

            // Check if user has permission to view full details
            let hasFullAccess = false;

            // Check if authenticated user owns the order
            if (isAuthenticated) {
                const userId = req.user.id;
                hasFullAccess =
                    await this.orderService.checkOrderTrackingPermission(
                        order.id,
                        userId,
                    );
                this.logger.log(`Authorized access via JWT: ${hasFullAccess}`);
            }
            // If email is provided, check if it matches the order's email
            else if (email) {
                // Need to check customer?.email safely and guestEmail safely
                const customerEmail = order.customer?.email?.toLowerCase();
                const guestEmail = order.guestEmail?.toLowerCase();
                const providedEmail = email.toLowerCase();

                hasFullAccess =
                    customerEmail === providedEmail ||
                    guestEmail === providedEmail;

                this.logger.log(`Email verification result: ${hasFullAccess}`);
            }

            // Get tracking info with limited details if not authorized
            const trackingInfo = await this.orderService.getOrderTrackingInfo(
                isNumericId ? parseInt(identifier) : identifier,
                !hasFullAccess, // true = limited info if not authorized
            );

            // If verification is needed, include masked email for the frontend to display as a hint
            let maskedEmail = null;
            if (!hasFullAccess) {
                const emailToMask = order.customer?.email || order.guestEmail;
                if (emailToMask) {
                    // Mask email - show only first 2 and last 2 characters of username part
                    const [username, domain] = emailToMask.split('@');
                    const maskedUsername =
                        username.length > 4
                            ? `${username.substring(0, 2)}****${username.substring(username.length - 2)}`
                            : username.substring(0, 1) + '****';
                    maskedEmail = `${maskedUsername}@${domain}`;
                }
            }

            return {
                success: true,
                order: trackingInfo,
                requiresVerification: !hasFullAccess,
                customerEmail: maskedEmail,
            };
        } catch (error) {
            this.logger.error(`Error tracking order: ${error.message}`);
            return {
                success: false,
                message:
                    error instanceof NotFoundException
                        ? 'Order not found'
                        : 'Unable to retrieve order information',
            };
        }
    }

    /**
     * Track order with verification data (POST method)
     * This endpoint is used when providing verification data directly
     */
    @Post('track')
    async trackOrderWithVerification(
        @Body() body: { orderId: number | string; verificationData: string },
    ) {
        try {
            this.logger.log(
                `Verifying access to order ${body.orderId} with verification data`,
            );

            let order;
            let orderId = body.orderId;

            // Check if the order identifier is a number or order number
            if (
                typeof body.orderId === 'number' ||
                /^\d+$/.test(body.orderId.toString())
            ) {
                // Convert to number if it's a string numeric value
                const numericId =
                    typeof body.orderId === 'string'
                        ? parseInt(body.orderId)
                        : body.orderId;
                order = await this.orderService.findOrderWithItems(numericId);
                orderId = numericId;
            } else {
                // Treat as order number
                order = await this.orderService.findOrderByNumber(
                    body.orderId.toString(),
                );
                orderId = body.orderId;
            }

            if (!order) {
                throw new NotFoundException(`Order ${body.orderId} not found`);
            }

            // Verify access using the provided verification data
            const hasAccess = await this.orderService.verifyOrderAccess(
                order.id,
                body.verificationData,
            );

            if (!hasAccess) {
                return {
                    success: false,
                    message: 'Thông tin xác thực không chính xác',
                    requiresVerification: true,
                };
            }

            // Get full order details since verification was successful
            const trackingInfo = await this.orderService.getOrderTrackingInfo(
                orderId,
                false,
            );

            return {
                success: true,
                order: trackingInfo,
            };
        } catch (error) {
            this.logger.error(`Error verifying order access: ${error.message}`);
            return {
                success: false,
                message:
                    error instanceof NotFoundException
                        ? 'Order not found'
                        : 'Unable to verify order access',
            };
        }
    }

    /**
     * Request an OTP to track an order
     */
    @Post('track/send-otp')
    async requestTrackingOtp(@Body() body: SendOTPDto) {
        const { orderId, email } = body;
        const clientIp = 'unknown'; // In a real app, get from request
        const requestKey = `${clientIp}-${email}-${orderId}`;

        // Implement rate limiting
        if (this.isRateLimited(requestKey)) {
            return {
                success: false,
                message: 'Too many OTP requests. Please try again later.',
            };
        }

        try {
            // Generate OTP
            const otp = await this.orderService.generateTrackingOTP(
                orderId,
                email,
            );

            // Send OTP via email
            await this.emailService.sendOrderTrackingOTP(
                email,
                otp,
                orderId.toString(),
            );

            // Record this attempt
            this.recordOtpAttempt(requestKey);

            return {
                success: true,
                message: 'Verification code sent to your email',
            };
        } catch (error) {
            this.logger.error(
                `Error generating tracking OTP: ${error.message}`,
            );

            // Don't leak information about which part failed
            return {
                success: false,
                message:
                    'If the order exists and the email is correct, a verification code has been sent.',
            };
        }
    }

    /**
     * Verify OTP and get full order details
     */
    @Post('track/verify-otp')
    async verifyTrackingOtp(@Body() body: VerifyOTPDto) {
        const { orderId, email, otp } = body;

        try {
            // Verify OTP
            const isValid = await this.orderService.verifyTrackingOTP(
                orderId,
                email,
                otp,
            );

            if (!isValid) {
                return {
                    success: false,
                    message: 'Invalid or expired verification code',
                };
            }

            // Get full order details
            const trackingInfo = await this.orderService.getOrderTrackingInfo(
                orderId,
                false,
            );

            return {
                success: true,
                order: trackingInfo,
            };
        } catch (error) {
            this.logger.error(`Error verifying tracking OTP: ${error.message}`);
            return {
                success: false,
                message: 'Failed to verify order access',
            };
        }
    }

    // Rate limiting helper methods
    private recordOtpAttempt(key: string): void {
        const now = Date.now();
        const attempt = this.otpAttempts.get(key) || {
            count: 0,
            lastAttempt: now,
        };

        if (now - attempt.lastAttempt > 3600000) {
            // 1 hour
            attempt.count = 1;
        } else {
            attempt.count++;
        }

        attempt.lastAttempt = now;
        this.otpAttempts.set(key, attempt);
    }

    private isRateLimited(key: string): boolean {
        const attempt = this.otpAttempts.get(key);
        if (!attempt) return false;

        const now = Date.now();
        if (now - attempt.lastAttempt > 3600000) {
            // Reset after 1 hour
            this.otpAttempts.delete(key);
            return false;
        }

        return attempt.count >= 3; // Max 3 attempts per hour
    }

    // Helper method to clean up request tracking
    private cleanupOldRequests() {
        const now = Date.now();
        this.recentRequests.forEach((timestamp, key) => {
            if (now - timestamp > 60000) {
                // Remove entries older than 1 minute
                this.recentRequests.delete(key);
            }
        });
    }
}
