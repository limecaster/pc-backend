import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ViewedProduct } from '../entities/viewed-product.entity';
import { Product } from '../../product/product.entity';

@Injectable()
export class ViewedProductsService {
    private readonly logger = new Logger(ViewedProductsService.name);

    constructor(
        @InjectRepository(ViewedProduct)
        private readonly viewedProductsRepository: Repository<ViewedProduct>,
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
    ) {}

    async trackProductView(
        customerId: number,
        productId: string,
    ): Promise<void> {
        try {
            // Check if the product exists
            const product = await this.productRepository.findOne({
                where: { id: productId },
            });
            if (!product) {
                this.logger.warn(`Product ${productId} not found`);
                return;
            }

            // Try to find existing view
            const existingView = await this.viewedProductsRepository.findOne({
                where: { customerId, productId },
            });

            if (existingView) {
                // Update the viewed_at timestamp
                existingView.viewedAt = new Date();
                await this.viewedProductsRepository.save(existingView);
            } else {
                // Create new view record
                const viewedProduct = this.viewedProductsRepository.create({
                    customerId,
                    productId,
                });
                await this.viewedProductsRepository.save(viewedProduct);
            }
        } catch (error) {
            this.logger.error(
                `Error tracking product view: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    async getViewedProducts(
        customerId: number,
        page: number = 1,
        limit: number = 10,
    ): Promise<{ products: any[]; total: number; pages: number }> {
        try {
            const [viewedProducts, total] =
                await this.viewedProductsRepository.findAndCount({
                    where: { customerId },
                    order: { viewedAt: 'DESC' },
                    skip: (page - 1) * limit,
                    take: limit,
                    relations: ['product'],
                });

            const products = viewedProducts.map((vp) => ({
                ...vp.product,
                viewedAt: vp.viewedAt,
            }));

            return {
                products,
                total,
                pages: Math.ceil(total / limit),
            };
        } catch (error) {
            this.logger.error(
                `Error getting viewed products: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    async clearViewedProducts(customerId: number): Promise<void> {
        try {
            await this.viewedProductsRepository.delete({ customerId });
        } catch (error) {
            this.logger.error(
                `Error clearing viewed products: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }
}
