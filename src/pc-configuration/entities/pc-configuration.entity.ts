import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import { PCConfigurationProduct } from './pc-configuration-product.entity';

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

    // Remove the products JSON field and add OneToMany relation
    @OneToMany(() => PCConfigurationProduct, product => product.configuration, {
        cascade: true,
        eager: true,
    })
    products: PCConfigurationProduct[];

    @Column({
        name: 'total_price',
        type: 'decimal',
        precision: 15,
        scale: 2,
        nullable: true,
    })
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
