import { Controller, Get, Param, UseGuards, Request, NotFoundException, Logger, Patch, Body, Post } from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderStatus } from './order.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';

@Controller('orders')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);
  
  constructor(private readonly orderService: OrderService) {}
  
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    try {
      this.logger.log(`Fetching order with ID: ${id}`);
      const order = await this.orderService.findOrderWithItems(parseInt(id));
      
      if (!order) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }
      
      return {
        success: true,
        order
      };
    } catch (error) {
      this.logger.error(`Error fetching order: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  @UseGuards(JwtAuthGuard)
  @Get('user/history')
  async getUserOrderHistory(@Request() req) {
    try {
      const customerId = req.user.id;
      this.logger.log(`Fetching order history for user ID: ${customerId}`);
      
      const orders = await this.orderService.findOrdersByCustomerId(customerId);
      
      return {
        success: true,
        orders
      };
    } catch (error) {
      this.logger.error(`Error fetching user order history: ${error.message}`);
      return {
        success: false,
        message: error.message
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
        orders
      };
    } catch (error) {
      this.logger.error(`Error fetching pending orders: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') orderId: string,
    @Body() data: { status: OrderStatus },
    @Request() req
  ) {
    try {
      this.logger.log(`Staff ${req.user.id} updating order ${orderId} status to ${data.status}`);
      
      const updatedOrder = await this.orderService.updateOrderStatus(
        parseInt(orderId),
        data.status,
        req.user.id
      );
      
      return {
        success: true,
        order: updatedOrder
      };
    } catch (error) {
      this.logger.error(`Error updating order status: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  async cancelOrder(@Param('id') orderId: string, @Request() req) {
    try {
      // First check if the order belongs to the current user
      const order = await this.orderService.findOrderWithItems(parseInt(orderId));
      
      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }
      
      if (order.customerId !== req.user.id) {
        return {
          success: false,
          message: 'You do not have permission to cancel this order'
        };
      }
      
      // Only pending_approval or approved orders can be cancelled by customers
      if (![OrderStatus.PENDING_APPROVAL, OrderStatus.APPROVED].includes(order.status)) {
        return {
          success: false,
          message: 'This order cannot be cancelled'
        };
      }
      
      const updatedOrder = await this.orderService.updateOrderStatus(
        parseInt(orderId),
        OrderStatus.CANCELLED
      );
      
      return {
        success: true,
        order: updatedOrder
      };
    } catch (error) {
      this.logger.error(`Error cancelling order: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  @UseGuards(JwtAuthGuard)
  @Post(':id/pay')
  async initiatePayment(@Param('id') orderId: string, @Request() req) {
    try {
      // First check if the order belongs to the current user
      const order = await this.orderService.findOrderWithItems(parseInt(orderId));
      
      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }
      
      if (order.customerId !== req.user.id) {
        return {
          success: false,
          message: 'You do not have permission to pay for this order'
        };
      }
      
      // Only approved orders can be paid
      if (order.status !== OrderStatus.APPROVED) {
        return {
          success: false,
          message: 'This order is not ready for payment'
        };
      }
      
      // Here we would integrate with the payment service
      // For now, we'll just redirect to the payment page
      
      return {
        success: true,
        redirectUrl: `/checkout/payment/${orderId}`
      };
    } catch (error) {
      this.logger.error(`Error initiating payment: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
}
