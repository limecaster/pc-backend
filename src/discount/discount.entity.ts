import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type DiscountTargetType = 'all' | 'products' | 'categories' | 'customers';

@Entity('Discount')
export class Discount {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'discount_code', unique: true })
    discountCode: string;

    @Column({ name: 'discount_name' })
    discountName: string;

    @Column({ name: 'discount_description', nullable: true, type: 'text' })
    discountDescription?: string;

    @Column({ name: 'start_date' })
    startDate: Date;

    @Column({ name: 'end_date' })
    endDate: Date;

    @Column({ name: 'discount_amount', type: 'decimal', precision: 10, scale: 2 })
    discountAmount: number;

    @Column()
    type: 'percentage' | 'fixed';

    @Column()
    status: 'active' | 'inactive' | 'expired';

    // New fields for targeting
    @Column({ default: 'all' })
    targetType: DiscountTargetType;

    @Column('simple-array', { nullable: true })
    productIds?: string[];

    @Column('simple-array', { nullable: true })
    categoryNames?: string[];

    @Column('simple-array', { nullable: true })
    customerIds?: string[];

    @Column({ nullable: true })
    minOrderAmount?: number;

    @Column({ default: false })
    isFirstPurchaseOnly: boolean;

    @Column({ default: false })
    isAutomatic: boolean;

    @Column({ default: 0 })
    usageCount: number;

    @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2, default: 0 })
    totalSavingsAmount: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
