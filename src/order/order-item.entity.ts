import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../product/product.entity';

@Entity('Order_Detail')
export class OrderItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({default: 1})
    quantity: number;
    
    // Add price field
    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    price: number;

    @ManyToOne(() => Order, order => order.items)
    @JoinColumn({ name: 'order_id' })
    order: Order;

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'product_id' })
    product: Product;
}
