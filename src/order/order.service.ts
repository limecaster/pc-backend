import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderDto } from './dto/order.dto';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>
  ) {}
  
  async findOrderWithItems(id: number): Promise<OrderDto> {
    // Get the order
    const order = await this.orderRepository.findOne({ 
      where: { id },
      relations: ['customer'] 
    });
    
    if (!order) {
      return null;
    }
    
    // Get the order items
    const items = await this.orderItemRepository.find({
      where: { order: { id: order.id } },
      relations: ['product']
    });
    
    // Combine into DTO
    const orderDto: OrderDto = {
      ...order,
      items,
      customerId: order.customer?.id
    };
    
    return orderDto;
  }
  
  // Add other service methods as needed
}
