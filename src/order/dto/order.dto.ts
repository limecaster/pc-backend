import { OrderItem } from '../order-item.entity';
import { OrderStatus } from '../order.entity';
import { Customer } from '../../customer/customer.entity';

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
    customer?: Customer; // Add full customer object
    items: OrderItem[];
    createdAt: Date;
    updatedAt: Date;
    approvedBy?: number;
    approvalDate?: Date;
    guestEmail?: string; // Add guestEmail field
}
