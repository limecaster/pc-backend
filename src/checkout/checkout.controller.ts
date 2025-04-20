import {
    Body,
    Controller,
    Post,
    UseGuards,
    Request,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderDto } from '../order/dto/order.dto';
import { OrderStatus } from 'src/order/order.entity';
import { OrderService } from '../order/order.service';
import { PaymentService } from '../payment/payment.service';

@Controller('checkout')
export class CheckoutController {
    private readonly logger = new Logger(CheckoutController.name);

    constructor(
        private readonly checkoutService: CheckoutService,
        private readonly paymentService: PaymentService,
    ) { }

    @Post('create-order')
    @UseGuards(JwtAuthGuard)
    async createOrder(@Request() req, @Body() createOrderDto: CreateOrderDto) {
        try {
            const order: OrderDto = await this.checkoutService.createOrder(
                req.user.id,
                createOrderDto,
            );
            return {
                success: true,
                order,
                finalPrice: createOrderDto.subtotal || 0,
            };
        } catch (error) {
            this.logger.error(
                `Critical: Error creating order for user #${req.user.id}: ${error.message}`,
            );
            throw new HttpException(
                {
                    status: HttpStatus.BAD_REQUEST,
                    error: error.message,
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    @Post('process-payment')
    async processPayment(@Body() paymentData: any) {
        try {
            const result =
                await this.checkoutService.processPayment(paymentData);
            return result;
        } catch (error) {
            this.logger.error(
                `Critical: Error processing payment for order #${paymentData.orderId}: ${error.message}`,
            );
            throw new HttpException(
                {
                    status: HttpStatus.BAD_REQUEST,
                    error: error.message,
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    @Post('update-order-status')
    async updateOrderStatus(
        @Body() data: { orderId: number; status: OrderStatus },
    ) {
        try {
            const { orderId, status } = data;
            const result = await this.checkoutService.updateOrderStatus(
                orderId,
                status,
            );
            return {
                success: true,
                order: result,
            };
        } catch (error) {
            this.logger.error(
                `Critical: Error updating order #${data.orderId} status to ${data.status}: ${error.message}`,
            );
            throw new HttpException(
                {
                    status: HttpStatus.BAD_REQUEST,
                    error: error.message,
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    @Post('payment/create')
    async createPayment(@Body() paymentData: any) {
        try {
            const result =
                await this.paymentService.createPaymentLink(paymentData);

            return result;
        } catch (error) {
            this.logger.error(
                `Critical: Error creating payment link: ${error.message}`,
            );
            return {
                success: false,
                message:
                    error.message ||
                    'An error occurred during payment processing',
            };
        }
    }
}
