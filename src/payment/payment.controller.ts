import { Body, Controller, HttpCode, Post, Headers, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Post('create')
  @HttpCode(200)
  async createPayment(@Body() orderData: any) {
    try {
      this.logger.log('Creating payment for order:', orderData.orderId);
      const paymentData = await this.paymentService.createPaymentLink(orderData);
      
      // Log the response to help with debugging
      this.logger.log('Payment data created:', paymentData);
      
      // Check if payment creation was successful
      if (paymentData.code !== '00') {
        throw new HttpException({
          status: HttpStatus.BAD_REQUEST,
          error: `PayOS Error: ${paymentData.desc || 'Unknown error'}`,
          code: paymentData.code
        }, HttpStatus.BAD_REQUEST);
      }
      
      // Return data in a structured format including the original order ID
      return {
        success: true,
        data: paymentData.data,
        originalOrderId: paymentData.originalOrderId, // Pass through the original order ID
        message: 'Payment link created successfully'
      };
    } catch (error) {
      this.logger.error('Error in createPayment:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Failed to create payment',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-signature') signature: string,
  ) {
    try {
      // Verify the webhook signature
      const isValid = this.paymentService.verifyPaymentWebhook(payload, signature);
      
      if (!isValid) {
        this.logger.error('Invalid webhook signature');
        return { success: false, message: 'Invalid signature' };
      }
      
      // Handle the payment notification
      this.logger.log('Payment webhook received:', payload);
      
      // Process the webhook data based on the payment status
      if (payload.data && payload.data.status === 'PAID') {
        // Payment was successful
        this.logger.log('Payment successful for order:', payload.data.orderCode);
        // TODO: Update order status in database, send confirmation emails, etc.
      }
      
      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      return { success: false, message: 'Error processing webhook' };
    }
  }
}
