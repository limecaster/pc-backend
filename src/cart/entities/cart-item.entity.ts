import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Cart } from './cart.entity';
import { Product } from '../../product/product.entity';

@Entity('Cart_Item')
export class CartItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'cart_id' })
    cartId: number;

    @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cart_id' })
    cart: Cart;

    @Column({ name: 'product_id', type: 'uuid' })
    productId: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({ name: 'product_quantity' })
    quantity: number;

    @Column({ name: 'sub_price', type: 'decimal', precision: 15, scale: 2 })
    subPrice: number;
}
