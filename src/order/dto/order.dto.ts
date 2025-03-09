import { OrderItem } from '../order-item.entity';
import { OrderStatus } from '../order.entity';

export class OrderDto {
    id: number;
    orderNumber: string;
    total: number;
    orderDate: Date;
    receiveDate: Date;
    status: OrderStatus;
    paymentMethod: string;
    deliveryAddress: string;
    customerId: number;
    items: OrderItem[];
    createdAt: Date;
    updatedAt: Date;
    approvedBy?: number;
    approvalDate?: Date;
}
