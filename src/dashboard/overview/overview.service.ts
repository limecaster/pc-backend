import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../customer/customer.entity';
import { Order } from '../../order/order.entity';
import { DashboardOverviewDto, OrderSummaryDto, RecentOrderDto } from './dto/overview.dto';

@Injectable()
export class OverviewService {
  constructor(
    @InjectRepository(Customer)
    private userRepository: Repository<Customer>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async getDashboardOverview(userId: number): Promise<DashboardOverviewDto> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      relations: ['addresses', 'orders'],
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    // Get order statistics
    const orders = user.orders || [];
    const orderSummary: OrderSummaryDto = {
      total: orders.length,
      pending: orders.filter(order => order.status === 'pending').length,
      processing: orders.filter(order => order.status === 'processing').length,
      completed: orders.filter(order => order.status === 'completed').length,
      cancelled: orders.filter(order => order.status === 'cancelled').length,
    };

    // Get recent orders
    const recentOrders: RecentOrderDto[] = orders
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.createdAt,
        total: order.total,
        status: order.status,
        items: order.items?.length || 0,
      }));

    return {
      orderSummary,
      recentOrders,
      savedAddresses: user.addresses?.length || 0,
      wishlistItems: user.wishlist?.length || 0,
    };
  }
}
