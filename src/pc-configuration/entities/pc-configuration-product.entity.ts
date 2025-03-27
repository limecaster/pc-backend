import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PCConfiguration } from './pc-configuration.entity';

@Entity({ name: 'PC_Configuration_Product' })
export class PCConfigurationProduct {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'configuration_id' })
    configurationId: number;

    @ManyToOne(() => PCConfiguration, configuration => configuration.products, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'configuration_id' })
    configuration: PCConfiguration;

    @Column({ name: 'product_id' })
    productId: string;

    @Column()
    componentType: string; // CPU, RAM, etc.

    @Column({ nullable: true })
    category: string; // Mapped category name

    @Column({ nullable: true })
    name: string;

    @Column({ 
        type: 'decimal', 
        precision: 15, 
        scale: 2, 
        nullable: true
    })
    price: number;

    @Column({ type: 'json', nullable: true })
    details: any; // Additional product details as needed

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
