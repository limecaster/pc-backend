import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Customer } from '../../customer/customer.entity';
import { Product } from '../../product/product.entity';

@Entity('Viewed_Products')
export class ViewedProduct {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ name: 'customer_id' })
    customerId: number;

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({ name: 'product_id' })
    productId: string;

    @CreateDateColumn({ name: 'viewed_at' })
    viewedAt: Date;
} 