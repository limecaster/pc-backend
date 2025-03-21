import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'PC_Configuration' })
export class PCConfiguration {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'customer_id' })
    customerId: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    purpose: string;

    @Column({ type: 'json' })
    products: Record<string, any>;

    @Column({ name: 'total_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
    totalPrice: number;

    @Column({ nullable: true })
    wattage: number;

    @Column({ default: 'active' })
    status: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
