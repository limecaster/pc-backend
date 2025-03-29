import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from '../product.entity';

@Entity('Hot_Sales')
export class HotSales {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column()
    productId: string;
    
    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;
    
    @Column({ default: 0 })
    displayOrder: number;
    
    @CreateDateColumn()
    createdAt: Date;
}
