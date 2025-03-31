import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
} from 'typeorm';
import { Customer } from '../customer/customer.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
    PENDING_APPROVAL = 'pending_approval',
    APPROVED = 'approved',
    PAYMENT_SUCCESS = 'payment_success',
    PAYMENT_FAILURE = 'payment_failure',
    PROCESSING = 'processing',
    SHIPPING = 'shipping',
    DELIVERED = 'delivered',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed',
}

@Entity({ name: 'Orders' })
export class Order {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true, name: 'order_number', nullable: true })
    orderNumber: string;

    @Column({ type: 'decimal', precision: 15, scale: 2, name: 'total_price' })
    total: number;

    @Column({ nullable: true })
    subtotal: number;

    @Column({ nullable: true })
    shippingFee: number;

    @Column({ name: 'order_date' })
    orderDate: Date;

    @Column({ nullable: true, name: 'receive_date' })
    receiveDate: Date;

    @Column({
        type: 'enum',
        enum: OrderStatus,
        default: OrderStatus.PENDING_APPROVAL,
    })
    status: OrderStatus;

    @Column({ nullable: true, name: 'payment_method' })
    paymentMethod: string;

    @Column({ name: 'delivery_address' })
    deliveryAddress: string;

    @Column({ nullable: true })
    customerName: string;

    @Column({ nullable: true })
    customerPhone: string;

    @Column({ nullable: true })
    deliveryCity: string;

    @ManyToOne(() => Customer, (customer) => customer.orders)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // Field for staff member who approved the order
    @Column({ nullable: true })
    approvedBy: number;

    @Column({ nullable: true })
    approvalDate: Date;

    @Column({ nullable: true })
    shippedAt: Date;

    @Column({ nullable: true })
    deliveredAt: Date;

    @Column({ nullable: true })
    guestEmail: string;

    // Add fields to store discount information
    @Column({ type: 'simple-array', nullable: true })
    appliedDiscountIds?: string[];

    @Column({ nullable: true })
    manualDiscountId?: number;

    @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
    discountAmount?: number;

    @Column({ default: false })
    discountUsageRecorded: boolean;

    @OneToMany(() => OrderItem, (orderItem) => orderItem.order)
    items: OrderItem[];
}
