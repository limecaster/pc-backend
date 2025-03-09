import { Body, Controller, HttpCode, Post, Headers, Logger, HttpException, HttpStatus, Get, Param } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CheckoutService } from '../checkout/checkout.service';
import { OrderStatus } from '../order/order.entity';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly checkoutService: CheckoutService
  ) {}

  @Post('create')
  @HttpCode(200)
  async createPayment(@Body() orderData: any) {
    try {
      this.logger.log('Creating payment for order:', orderData.orderId);
      
      // First, check if the order is in APPROVED status
      if (orderData.orderId) {
        const orderId = parseInt(orderData.orderId);
        try {
          // Only allow payment for approved orders
          const order = await this.checkoutService.updateOrderStatus(orderId, OrderStatus.APPROVED);
          
          if (order.status !== OrderStatus.APPROVED) {
            throw new HttpException({
              status: HttpStatus.BAD_REQUEST,
              error: `Order is not approved for payment. Current status: ${order.status}`,
            }, HttpStatus.BAD_REQUEST);
          }
        } catch (error) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Order status check failed: ${error.message}`,
          }, HttpStatus.BAD_REQUEST);
        }
      }
      
      // Now create the payment link using PayOS
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
        
        // Extract the order ID from the description (format: "Order #123 Thanh toan B Store")
        const descriptionMatch = payload.data.description.match(/Order #(\d+)/);
        let orderId: number | null = null;
        
        if (descriptionMatch && descriptionMatch[1]) {
          orderId = parseInt(descriptionMatch[1], 10);
          this.logger.log(`Extracted order ID: ${orderId}`);
        }
        
        if (orderId && !isNaN(orderId)) {
          try {
            // Update order status to PAYMENT_SUCCESS, which will trigger next steps
            this.logger.log(`Updating order status for order ID: ${orderId}`);
            await this.checkoutService.updateOrderStatus(orderId, OrderStatus.PAYMENT_SUCCESS);
            
            // Then move to processing state after successful payment
            await this.checkoutService.updateOrderStatus(orderId, OrderStatus.PROCESSING);
            this.logger.log(`Order status updated successfully for order ID: ${orderId}`);
          } catch (updateError) {
            this.logger.error(`Error updating order status: ${updateError.message}`);
            return { success: false, message: `Error updating order status: ${updateError.message}` };
          }
        } else {
          this.logger.error('Could not extract valid order ID from description:', payload.data.description);
        }
      } else if (payload.data && payload.data.status === 'CANCELED') {
        // Payment was cancelled
        const descriptionMatch = payload.data.description.match(/Order #(\d+)/);
        let orderId: number | null = null;
        
        if (descriptionMatch && descriptionMatch[1]) {
          orderId = parseInt(descriptionMatch[1], 10);
          this.logger.log(`Payment cancelled for order ID: ${orderId}`);
          
          if (orderId && !isNaN(orderId)) {
            try {
              await this.checkoutService.updateOrderStatus(orderId, OrderStatus.PAYMENT_FAILURE);
            } catch (updateError) {
              this.logger.error(`Error updating order status: ${updateError.message}`);
            }
          }
        }
      }
      
      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      return { success: false, message: 'Error processing webhook' };
    }
  }
  
  @Get('status/:paymentId')
  async checkPaymentStatus(@Param('paymentId') paymentId: string) {
    try {
      const status = await this.paymentService.checkPaymentStatus(paymentId);
      
      // If payment status is PAID, update the order status
      if (status.success && status.status === 'PAID') {
        const paymentData = status.paymentData;
        
        // Check if description exists before trying to extract order ID
        if (paymentData && paymentData.description) {
          // Extract order ID from description
          const descriptionMatch = paymentData.description.match(/Order #(\d+)/);
          
          if (descriptionMatch && descriptionMatch[1]) {
            const orderId = parseInt(descriptionMatch[1], 10);
            if (!isNaN(orderId)) {
              try {
                this.logger.log(`Payment completed, updating order ${orderId} status to PAYMENT_SUCCESS`);
                await this.checkoutService.updateOrderStatus(orderId, OrderStatus.PAYMENT_SUCCESS);
                
                // Then update to PROCESSING
                await this.checkoutService.updateOrderStatus(orderId, OrderStatus.PROCESSING);
                
                (status as any).orderUpdated = true;
                (status as any).orderId = orderId;
              } catch (updateError) {
                this.logger.error(`Failed to update order status: ${updateError.message}`);
              }
            }
          } else {
            this.logger.log(`Could not extract order ID from description: "${paymentData.description}"`);
          }
        } else {
          this.logger.log('Payment data does not contain description field');
        }
      }
      
      return status;
    } catch (error) {
      this.logger.error(`Error checking payment status: ${error.message}`);
      throw new HttpException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Failed to check payment status',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
