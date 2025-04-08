import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Cart } from '../cart/entities/cart.entity';
import { Address } from './address.entity';
import { Order } from '../order/order.entity';

@Entity({ name: 'Customer' })
export class Customer {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    firstname: string;

    @Column()
    lastname: string;

    @Column({ name: 'phone_number', nullable: true })
    phoneNumber: string;

    @Column({ unique: true })
    username: string;

    @Column({ nullable: true })
    @Exclude()
    password: string;

    @Column({ nullable: true })
    avatar: string;

    @Column({ default: 'active' })
    status: string;

    @Column({ unique: true })
    email: string;

    @Column({ default: true, name: 'isEmailVerified' })
    isEmailVerified: boolean;

    @Column({ nullable: true })
    street: string;

    @Column({ nullable: true })
    ward: string;

    @Column({ nullable: true })
    district: string;

    @Column({ nullable: true })
    city: string;

    @Column({ nullable: true })
    birthday: Date;

    @Column({ nullable: true })
    gender: string;

    @Column({ name: 'latest_login', nullable: true })
    latestLogin: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ nullable: true })
    @Exclude()
    verificationToken: string;

    @Column({ nullable: true })
    passwordResetToken: string;

    @Column({ nullable: true })
    passwordResetExpires: Date;

    @OneToOne(() => Cart, (cart) => cart.customer)
    cart: Cart;

    @OneToMany(() => Address, (address) => address.customer)
    addresses: Address[];

    @OneToMany(() => Order, (order) => order.customer)
    orders: Order[];

    // Property for wishlist items
    @Column({ type: 'jsonb', nullable: true })
    wishlist: any[];

    @Column({ nullable: true })
    googleId: string;

    role: import('../auth/enums/role.enum').Role;
}
