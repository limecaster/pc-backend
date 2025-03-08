import { OrderItem } from '../order-item.entity';

export class OrderDto {
  id: number;
  orderNumber: string;
  total: number;
  orderDate: Date;
  receiveDate: Date;
  status: string;
  paymentMethod: string;
  deliveryAddress: string;
  customerId: number;
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}
