import {
    Controller,
    Post,
    Body,
    Get,
    Param,
    Query,
    HttpException,
    HttpStatus,
    Logger,
    Req,
    Headers,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { OrderService } from '../order/order.service';
import { OrderStatus } from '../order/order.entity';
import { Request } from 'express';

@Controller('payment')
export class PaymentController {
    private readonly logger = new Logger(PaymentController.name);

    constructor(
        private readonly paymentService: PaymentService,
        private readonly orderService: OrderService,
    ) {}

    @Post('create')
    async createPayment(@Body() paymentData: any) {
        try {
            this.logger.log(
                `Creating payment for order: ${paymentData.orderId}`,
            );

            // Get order details if orderId is provided
            let orderDetails = null;
            if (paymentData.orderId) {
                const order = await this.orderService.findOrderWithItems(
                    parseInt(paymentData.orderId),
                );
                if (!order) {
                    throw new HttpException(
                        'Order not found',
                        HttpStatus.NOT_FOUND,
                    );
                }

                orderDetails = {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    customer: {
                        fullName: order.customer
                            ? `${order.customer.firstname} ${order.customer.lastname}`
                            : 'Guest',
                        email: order.customer?.email || order.guestEmail || '',
                        phone: order.customer?.phoneNumber || '',
                        address: order.deliveryAddress || '',
                    },
                    total: order.total,
                    items:
                        order.items?.map((item) => ({
                            id: item.product.id,
                            name: item.product.name,
                            price: item.product.price,
                            quantity: item.quantity,
                        })) || [],
                };

                // Add required data for payment - use a short description as required by PayOS
                paymentData = {
                    ...paymentData,
                    items: orderDetails.items,
                    customer: orderDetails.customer,
                    total: orderDetails.total,
                    description: `B Store #${order.id}`, // Keep description short (max 25 chars)
                    returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/success?orderId=${orderDetails.orderId}`,
                    cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/failure`,
                };
            }

            const result =
                await this.paymentService.createPaymentLink(paymentData);

            // Log full result for debugging
            this.logger.log('Payment service result:', result);

            // If we got a successful result but no checkoutUrl, call the payment service directly
            if (
                result.success &&
                result.data &&
                !result.data.checkoutUrl &&
                result.data.orderCode
            ) {
                this.logger.log(
                    'Payment link created but missing checkoutUrl, getting payment status',
                );

                // Try to get payment status which may contain the checkoutUrl
                const paymentStatus =
                    await this.paymentService.checkPaymentStatus(
                        result.data.orderCode.toString(),
                    );

                if (
                    paymentStatus.success &&
                    paymentStatus.data &&
                    paymentStatus.data.checkoutUrl
                ) {
                    // Add the checkoutUrl from the status response
                    result.data.checkoutUrl = paymentStatus.data.checkoutUrl;
                    this.logger.log(
                        'Retrieved checkoutUrl from payment status',
                    );
                } else {
                    this.logger.warn(
                        'Could not retrieve checkoutUrl from payment status',
                    );
                }
            }

            return result;
        } catch (error) {
            this.logger.error(
                `Payment creation error: ${error.message}`,
                error.stack,
            );
            throw new HttpException(
                error.message || 'Failed to create payment',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('status/:orderCode')
    async checkPaymentStatus(@Param('orderCode') orderCode: string) {
        try {
            this.logger.log(
                `Checking payment status for order code: ${orderCode}`,
            );
            const result =
                await this.paymentService.checkPaymentStatus(orderCode);

            return result;
        } catch (error) {
            this.logger.error(
                `Payment status check error: ${error.message}`,
                error.stack,
            );
            throw new HttpException(
                error.message || 'Failed to check payment status',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('webhook')
    async handlePaymentWebhook(
        @Body() payload: any,
        @Headers() headers: any,
        @Req() request: Request,
    ) {
        try {
            this.logger.log('Received payment webhook');

            // Verify the webhook signature if required by your payment provider
            // For this example, we'll just process the webhook data
            const result = await this.paymentService.verifyPaymentWebhook(
                payload,
                headers,
            );

            if (result.success) {
                const { orderId, status } = result.data;

                // Update order status based on payment status
                if (orderId && status === 'PAID') {
                    await this.orderService.updateOrderStatus(
                        parseInt(orderId),
                        OrderStatus.PAYMENT_SUCCESS,
                    );

                    this.logger.log(
                        `Order ${orderId} updated to PAYMENT_SUCCESS after successful payment`,
                    );
                }

                return {
                    success: true,
                    message: 'Webhook processed successfully',
                };
            }

            return result;
        } catch (error) {
            this.logger.error(
                `Payment webhook error: ${error.message}`,
                error.stack,
            );
            return {
                success: false,
                message: error.message || 'Failed to process webhook',
            };
        }
    }

    @Get('success')
    async handlePaymentSuccess(
        @Query('orderId') orderId: string,
        @Query('paymentId') paymentId: string,
        @Query('status') paymentStatus: string,
        @Query('code') paymentCode: string,
        @Req() request: Request,
    ) {
        try {
            this.logger.log(
                `Processing successful payment callback for order: ${orderId}`,
            );
            this.logger.log(
                `Payment parameters - status: ${paymentStatus}, code: ${paymentCode}, paymentId: ${paymentId}`,
            );

            // Validate the parameters
            if (!orderId) {
                return {
                    success: false,
                    message: 'Order ID is required',
                };
            }

            // Get the order to verify its current status
            const order = await this.orderService.findOrderWithItems(
                parseInt(orderId),
            );

            if (!order) {
                this.logger.warn(
                    `Order ${orderId} not found when processing payment success`,
                );
                return {
                    success: false,
                    message: 'Order not found',
                };
            }

            this.logger.log(
                `Found order ${orderId} with status: ${order.status}`,
            );

            // Check if this is a successful payment from PayOS
            const isPaid = paymentStatus === 'PAID' && paymentCode === '00';

            if (isPaid) {
                // Update order status to payment success
                this.logger.log(`Updating order ${orderId} to PAYMENT_SUCCESS`);
                await this.orderService.updateOrderStatus(
                    parseInt(orderId),
                    OrderStatus.PAYMENT_SUCCESS,
                );

                this.logger.log(
                    `Order ${orderId} successfully updated to PAYMENT_SUCCESS`,
                );
            } else {
                this.logger.warn(
                    `Payment for order ${orderId} has status ${paymentStatus}, code ${paymentCode} - not marking as paid`,
                );
            }

            return {
                success: true,
                message: isPaid
                    ? 'Payment successful'
                    : 'Payment status processed',
                orderId,
                paymentStatus,
            };
        } catch (error) {
            this.logger.error(
                `Payment success handler error: ${error.message}`,
                error.stack,
            );
            return {
                success: false,
                message: error.message || 'Error processing payment callback',
            };
        }
    }

    @Get('cancel')
    async handlePaymentCancel(@Query('orderId') orderId: string) {
        this.logger.log(`Payment cancelled for order: ${orderId}`);
        return {
            success: false,
            message: 'Payment was cancelled',
            orderId,
        };
    }

    @Get('debug/:orderId')
    async debugOrderPaymentStatus(@Param('orderId') orderId: string) {
        try {
            this.logger.log(
                `Debug request for order payment status: ${orderId}`,
            );

            const order = await this.orderService.findOrderWithItems(
                parseInt(orderId),
            );

            if (!order) {
                return {
                    success: false,
                    message: 'Order not found',
                };
            }

            return {
                success: true,
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    createdAt: order.createdAt,
                    updatedAt: order.updatedAt,
                },
            };
        } catch (error) {
            this.logger.error(`Debug endpoint error: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @Get('test-success/:orderId')
    async testPaymentSuccess(@Param('orderId') orderId: string) {
        if (process.env.NODE_ENV === 'production') {
            return { success: false, message: 'Not available in production' };
        }

        try {
            this.logger.log(
                `TEST: Manually updating order ${orderId} to payment_success status`,
            );

            // Update order status
            await this.orderService.updateOrderStatus(
                parseInt(orderId),
                OrderStatus.PAYMENT_SUCCESS,
            );

            return {
                success: true,
                message: 'Order status updated to payment_success for testing',
                orderId,
            };
        } catch (error) {
            this.logger.error(`Test endpoint error: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }
}
