import { Product } from '../../product/product.entity';
import { Customer } from '../../customer/customer.entity'; // Fixed: Use relative path
import { OrderItem } from '../order-item.entity';
import { OrderStatus } from '../order.entity';

export class OrderDto {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    orderDate: Date;
    total: number;
    subtotal?: number;
    shippingFee?: number;
    discountAmount?: number;
    deliveryAddress?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    
    // Add missing guest fields
    guestEmail?: string;
    guestName?: string;
    guestPhone?: string;
    
    // Add missing date fields
    createdAt?: Date;
    updatedAt?: Date;
    
    items: OrderItem[];
    customer?: Customer;
    customerId?: number;
    staffId?: number;
}
