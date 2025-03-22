import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderItem } from '../order-item.entity';
import { Product } from '../../product/product.entity';

@Injectable()
export class OrderInventoryService {
    private readonly logger = new Logger(OrderInventoryService.name);

    constructor(
        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,
        
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
    ) {}

    /**
     * Adjust inventory stock for all products in an order
     * @param orderId The order ID
     * @param operation 'increase' to add back to stock, 'decrease' to reduce stock
     * @param entityManager Optional entity manager for transaction support
     */
    async adjustInventoryForOrder(
        orderId: number, 
        operation: 'increase' | 'decrease',
        entityManager?: any
    ): Promise<void> {
        const repo = entityManager ? entityManager.getRepository(OrderItem) : this.orderItemRepository;
        const productRepo = entityManager ? entityManager.getRepository(Product) : this.productRepository;
        
        // Get all order items with their products
        const orderItems = await repo.find({
            where: { order: { id: orderId } },
            relations: ['product'],
        });

        if (!orderItems || orderItems.length === 0) {
            this.logger.warn(`No items found for order ${orderId} - skipping inventory adjustment`);
            return;
        }

        // Process each order item
        for (const item of orderItems) {
            if (!item.product) {
                this.logger.warn(`Order item ${item.id} has no associated product - skipping`);
                continue;
            }

            const product = await productRepo.findOne({
                where: { id: item.product.id },
            });

            if (!product) {
                this.logger.warn(`Product ${item.product.id} not found - skipping inventory adjustment`);
                continue;
            }

            const oldStock = product.stock_quantity;
            
            // Adjust stock based on operation
            if (operation === 'decrease') {
                // Don't allow negative stock
                product.stock_quantity = Math.max(0, product.stock_quantity - item.quantity);
            } else {
                product.stock_quantity = product.stock_quantity + item.quantity;
            }

            await productRepo.save(product);
            
            this.logger.log(
                `${operation === 'decrease' ? 'Reduced' : 'Increased'} stock for product ${product.id} ` +
                `from ${oldStock} to ${product.stock_quantity} (change: ${item.quantity})`
            );
        }
    }
}
