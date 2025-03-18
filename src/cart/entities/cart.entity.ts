import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    OneToMany,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { CartItem } from './cart-item.entity';
import { Customer } from '../../customer/customer.entity';

@Entity('Cart')
export class Cart {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50 })
    status: string;

    @Column({ name: 'customer_id' })
    customerId: number;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @OneToMany(() => CartItem, (item) => item.cart, {
        cascade: true,
        eager: true,
    })
    items: CartItem[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // Calculated property (not stored in DB)
    totalPrice: number;

    calculateTotalPrice(): number {
        return this.items
            ? this.items.reduce((sum, item) => sum + item.subPrice, 0)
            : 0;
    }
}
