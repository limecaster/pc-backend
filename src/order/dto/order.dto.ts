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

export class OrderItemDto {
    id: number;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    
    // Add discount-related fields
    discountId?: number;
    discountCode?: string;
    discountName?: string;
    discountAmount?: number;
    discountType?: 'percentage' | 'fixed' | 'none';
    originalPrice?: number;
    finalPrice?: number;
}

export class OrderDiscountAnalyticsDto {
    orderId: number;
    orderNumber: string;
    orderDate: Date;
    total: number;
    subtotal: number;
    totalDiscountAmount: number;
    items: {
        productId: string;
        productName: string;
        quantity: number;
        originalPrice: number;
        finalPrice: number;
        discountAmount: number;
        discountId: number;
        discountCode: string;
        discountType: string;
    }[];
}
