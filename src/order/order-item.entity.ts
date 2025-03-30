import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../product/product.entity';
import { Discount } from '../discount/discount.entity';

@Entity('Order_Detail')
export class OrderItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Order, order => order.items)
    @JoinColumn({ name: 'order_id' })
    order: Order;

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({ name: 'product_quantity', default: 1 })
    quantity: number;

    @Column({ type: 'decimal', precision: 15, scale: 2, name: 'sub_price', default: 0 })
    price: number;
    
    // Add new fields for discount tracking
    @ManyToOne(() => Discount, { nullable: true })
    @JoinColumn({ name: 'discount_id' })
    discount: Discount;
    
    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'discount_amount' })
    discountAmount: number;
    
    @Column({ nullable: true, name: 'discount_type' })
    discountType: 'percentage' | 'fixed' | 'none';
    
    @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, name: 'original_price' })
    originalPrice: number;
    
    @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, name: 'final_price' })
    finalPrice: number;
}
