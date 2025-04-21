import {
    Controller,
    Post,
    Body,
    Get,
    Param,
    Query,
    HttpException,
    HttpStatus,
    Req,
    Headers,
    Logger,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { OrderService } from '../order/order.service';
import { OrderStatus } from '../order/order.entity';
import { Request } from 'express';
@Controller('payment')
export class PaymentController {
    private readonly logger: Logger;

    constructor(
        private readonly paymentService: PaymentService,
        private readonly orderService: OrderService,
    ) {
        this.logger = new Logger('PaymentController');
    }

    @Post('create')
    async createPayment(@Body() paymentData: any) {
        try {
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
                    description: `B Store #${order.id}`,
                    returnUrl: `${process.env.WEBSITE_DOMAIN_NAME || 'http://localhost:3000'}/checkout/success?orderId=${orderDetails.orderId}`,
                    cancelUrl: `${process.env.WEBSITE_DOMAIN_NAME || 'http://localhost:3000'}/checkout/failure`,
                };
            }

            const result =
                await this.paymentService.createPaymentLink(paymentData);
            // If we got a successful result but no checkoutUrl, call the payment service directly
            if (
                result.success &&
                result.data &&
                !result.data.checkoutUrl &&
                result.data.orderCode
            ) {
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
                }
            }

            return { success: true, data: result.data };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to create payment',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('status/:orderCode')
    async checkPaymentStatus(@Param('orderCode') orderCode: string) {
        try {
            const result =
                await this.paymentService.checkPaymentStatus(orderCode);

            return result;
        } catch (error) {
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
            const result = await this.paymentService.verifyPaymentWebhook(payload, headers);
            if (result.success) {
                const { orderId, status, orderCode, transactionId } = result.data;

                // Update order status based on payment status
                if (orderId && status === 'PAID') {
                    try {
                        await this.orderService.updateOrderStatus(
                            parseInt(orderId),
                            OrderStatus.PAYMENT_SUCCESS,
                        );
                        this.logger.log(`Order ${orderId} marked as PAYMENT_SUCCESS`);
                    } catch (updateError) {
                        this.logger.error('Error updating order status from webhook', { updateError, orderId, status });
                        return {
                            success: false,
                            message: `Error updating order status: ${updateError.message}`,
                            orderId,
                            status,
                        };
                    }
                } else if (orderId && status === 'CANCELLED') {
                    // Optionally handle cancelled/refunded statuses
                    try {
                        await this.orderService.updateOrderStatus(
                            parseInt(orderId),
                            OrderStatus.CANCELLED,
                        );
                        this.logger.log(`Order ${orderId} marked as CANCELLED`);
                    } catch (updateError) {
                        this.logger.error('Error updating order status to CANCELLED from webhook', { updateError, orderId, status });
                        return {
                            success: false,
                            message: `Error updating order status: ${updateError.message}`,
                            orderId,
                            status,
                        };
                    }
                }

                return {
                    success: true,
                    message: 'Webhook processed successfully',
                    orderId,
                    status,
                    orderCode,
                    transactionId,
                };
            } else {
                this.logger.warn('Webhook verification failed', result);
                return result;
            }
        } catch (error) {
            this.logger.error('Error processing webhook', { error, payload, headers });
            return {
                success: false,
                message: error.message || 'Failed to process webhook',
            };
        }
    }

    @Get('success')
    async handlePaymentSuccess(
        @Query('orderId') orderId: string,
        @Query('status') paymentStatus: string,
        @Query('code') paymentCode: string,
        @Query('id') id: string,
        @Query('orderCode') orderCode: string,
        @Req() request: Request,
    ) {
        try {

            const isPaid = paymentStatus === 'PAID' && paymentCode === '00';

            if (orderId && isPaid) {
                try {
                    // First get the order to verify its existence and status
                    const order = await this.orderService.findOrderWithItems(
                        parseInt(orderId),
                    );

                    if (!order) {
                        return {
                            success: false,
                            message: 'Order not found',
                            orderId,
                        };
                    }

                    // Check if the order is in a state that can be updated
                    if (order.status === OrderStatus.APPROVED) {
                        // Update order status to PAYMENT_SUCCESS
                        await this.orderService.updateOrderStatus(
                            parseInt(orderId),
                            OrderStatus.PAYMENT_SUCCESS,
                        );
                        this.logger.log(`Order ${orderId} marked as PAYMENT_SUCCESS via returnUrl`);
                    } else {
                        return {
                            success: false,
                            message: `Order ${orderId} is in ${order.status} state and cannot be updated`,
                            orderId,
                        };
                    }
                } catch (error) {
                    this.logger.error(`Error updating order status for ${orderId}:`, error);
                    return {
                        success: false,
                        message: `Error updating order status: ${error.message}`,
                        orderId,
                    };
                }
            }

            return {
                success: false,
                message: 'Could not process payment success. Please check order status manually.',
                paymentStatus,
                paymentCode,
            };
        } catch (error) {
            this.logger.error('Error processing payment success callback', { error, orderId, paymentStatus, paymentCode, id, orderCode });
            return {
                success: false,
                message: `Error processing payment: ${error.message}`,
            };
        }
    }

    @Get('cancel')
    async handlePaymentCancel(@Query('orderId') orderId: string) {
        return {
            success: false,
            message: 'Payment was cancelled',
            orderId,
        };
    }

    // @Get('debug/:orderId')
    // async debugOrderPaymentStatus(@Param('orderId') orderId: string) {
    //     try {
    //         const order = await this.orderService.findOrderWithItems(
    //             parseInt(orderId),
    //         );

    //         if (!order) {
    //             return {
    //                 success: false,
    //                 message: 'Order not found',
    //             };
    //         }

    //         return {
    //             success: true,
    //             order: {
    //                 id: order.id,
    //                 orderNumber: order.orderNumber,
    //                 status: order.status,
    //                 createdAt: order.createdAt,
    //                 updatedAt: order.updatedAt,
    //             },
    //         };
    //     } catch (error) {
    //         return {
    //             success: false,
    //             message: error.message,
    //         };
    //     }
    // }

    // @Get('test-success/:orderId')
    // async testPaymentSuccess(@Param('orderId') orderId: string) {
    //     if (process.env.NODE_ENV === 'production') {
    //         return { success: false, message: 'Not available in production' };
    //     }

    //     try {
    //         // Update order status
    //         await this.orderService.updateOrderStatus(
    //             parseInt(orderId),
    //             OrderStatus.PAYMENT_SUCCESS,
    //         );

    //         return {
    //             success: true,
    //             message: 'Order status updated to payment_success for testing',
    //             orderId,
    //         };
    //     } catch (error) {
    //         return {
    //             success: false,
    //             message: error.message,
    //         };
    //     }
    // }
}
