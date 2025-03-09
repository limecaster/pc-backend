import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Product } from '../product/product.entity';

@Entity('Wishlist')
export class Wishlist {
  @PrimaryColumn()
  customer_id: number;

  @PrimaryColumn()
  product_id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
