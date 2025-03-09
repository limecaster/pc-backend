import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

@Entity('customer_address')
export class Address {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    fullName: string;

    @Column()
    phoneNumber: string;

    @Column()
    street: string;

    @Column()
    ward: string;

    @Column()
    district: string;

    @Column()
    city: string;

    @Column({ default: false })
    isDefault: boolean;

    @ManyToOne(() => Customer, (customer) => customer.addresses, {
        onDelete: 'CASCADE',
    })
    customer: Customer;

    @Column()
    customerId: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
