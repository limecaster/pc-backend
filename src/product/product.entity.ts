import { Entity, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('Products')
export class Product {
    @Column({ primary: true, type: 'uuid' })
    id: string;

    @Column({ length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'decimal', precision: 15, scale: 2 })
    price: number;

    @Column({ name: 'stock_quantity' })
    stockQuantity: number;

    @Column({ length: 50 })
    status: string;

    @Column({ length: 100 })
    category: string;

    @Column({ nullable: true })
    color?: string;

    @Column({ nullable: true })
    size?: string;

    @Column({ name: 'additional_info', nullable: true, type: 'text' })
    additionalInfo?: string;

    @Column({ name: 'additional_images', nullable: true, type: 'text' })
    additional_images?: string;

    @Column({
        name: 'original_price',
        nullable: true,
        type: 'decimal',
        precision: 15,
        scale: 2,
    })
    originalPrice?: number;

    @Column({ nullable: true, type: 'decimal', precision: 15, scale: 2 })
    discount?: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
