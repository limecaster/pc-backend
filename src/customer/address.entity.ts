import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

@Entity({ name: 'Address' })
export class Address {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    fullName: string;

    @Column({ nullable: true })
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
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ name: 'customer_id' })
    customerId: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
