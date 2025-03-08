import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany } from 'typeorm';
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

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ unique: true })
  username: string;

  @Column()
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

  @Column({ name: 'latest_login', nullable: true })
  latestLogin: Date;

  @Column({ name: 'created_at', nullable: true })
  @CreateDateColumn()
  createdAt: Date;

  @Column({ name: 'updated_at', nullable: true })
  @UpdateDateColumn()
  updatedAt: Date;

  // Added fields for authentication purposes
  @Column({ nullable: true })
  @Exclude()
  verificationToken: string;

  @Column({ nullable: true })
  @Exclude()
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpires: Date;

  @OneToOne(() => Cart, cart => cart.customer)
  cart: Cart;
  
  @OneToMany(() => Address, address => address.user)
  addresses: Address[];
  
  @OneToMany(() => Order, order => order.customer)
  orders: Order[];

  // Property for wishlist items
  @Column({ type: 'jsonb', nullable: true })
  wishlist: any[];
}
