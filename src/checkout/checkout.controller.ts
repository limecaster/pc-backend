import { Body, Controller, Post, UseGuards, Request, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { GuestOrderDto } from './dto/guest-order.dto';
import { OrderDto } from '../order/dto/order.dto';
import { OrderStatus } from 'src/order/order.entity';

@Controller('checkout')
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  async createOrder(@Request() req, @Body() createOrderDto: CreateOrderDto) {
    try {
      this.logger.log(`Creating order for user #${req.user.id}`);
      const order: OrderDto = await this.checkoutService.createOrder(req.user.id, createOrderDto);
      return {
        success: true,
        order
      };
    } catch (error) {
      this.logger.error(`Error creating order: ${error.message}`);
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: error.message,
      }, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('create-guest-order')
  async createGuestOrder(@Body() guestOrderDto: GuestOrderDto) {
    try {
      this.logger.log('Creating guest order');
      const order = await this.checkoutService.createGuestOrder(guestOrderDto);
      return {
        success: true,
        order
      };
    } catch (error) {
      this.logger.error(`Error creating guest order: ${error.message}`);
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: error.message,
      }, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('process-payment')
  async processPayment(@Body() paymentData: any) {
    try {
      this.logger.log(`Processing payment for order #${paymentData.orderId}`);
      const result = await this.checkoutService.processPayment(paymentData);
      return result;
    } catch (error) {
      this.logger.error(`Error processing payment: ${error.message}`);
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: error.message,
      }, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('update-order-status')
  async updateOrderStatus(@Body() data: { orderId: number, status: OrderStatus }) {
    try {
      const { orderId, status } = data;
      this.logger.log(`Updating order #${orderId} status to ${status}`);
      const result = await this.checkoutService.updateOrderStatus(orderId, status);
      return {
        success: true,
        order: result
      };
    } catch (error) {
      this.logger.error(`Error updating order status: ${error.message}`);
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: error.message,
      }, HttpStatus.BAD_REQUEST);
    }
  }
}
