import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Customer } from '../customer/customer.entity';

@Entity({ name: 'Orders' })
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, name: 'order_number', nullable: true })
  orderNumber: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'total_price' })
  total: number;

  @Column({ name: 'order_date' })
  orderDate: Date;

  @Column({ nullable: true, name: 'receive_date' })
  receiveDate: Date;

  @Column()
  status: string; // pending, processing, completed, cancelled

  @Column({ nullable: true, name: 'payment_method' })
  paymentMethod: string;

  @Column({ name: 'delivery_address' })
  deliveryAddress: string;

  @ManyToOne(() => Customer, customer => customer.orders)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  items: any;
}
