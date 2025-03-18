import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wishlist } from './wishlist.entity';
import { Product } from '../product/product.entity';
import { WishlistItemDto } from './dto/wishlist.dto';
import { Neo4jConfigService } from '../../config/neo4j.config';

@Injectable()
export class WishlistService {
    constructor(
        @InjectRepository(Wishlist)
        private wishlistRepository: Repository<Wishlist>,
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
        private readonly neo4jConfigService: Neo4jConfigService,
    ) {}

    async getWishlist(customerId: number): Promise<WishlistItemDto[]> {
        try {
            const driver = this.neo4jConfigService.getDriver();
            const session = driver.session();

            // Get wishlist items
            const wishlistItems = await this.wishlistRepository.find({
                where: { customer_id: customerId },
                relations: ['product'],
            });

            // Create enhanced wishlist items with Neo4j data
            const enhancedItems: WishlistItemDto[] = [];

            for (const item of wishlistItems) {
                if (!item.product) {
                    continue; // Skip items with missing product references
                }

                // Get image URL from Neo4j
                const specificationsQuery = `
          MATCH (p {id: $id}) RETURN p.imageUrl AS imageUrl
        `;

                const specificationsResult = await session.run(
                    specificationsQuery,
                    { id: item.product_id },
                );

                const imageUrl =
                    specificationsResult.records[0]?.get('imageUrl') || '';

                enhancedItems.push({
                    product_id: item.product_id,
                    name: item.product.name,
                    price: parseFloat(item.product.price.toString()),
                    imageUrl,
                });
            }

            await session.close();
            return enhancedItems;
        } catch (error) {
            console.error('Error fetching wishlist:', error);
            throw new Error('Failed to fetch wishlist');
        }
    }

    async addToWishlist(
        customerId: number,
        productId: string,
    ): Promise<{ message: string }> {
        try {
            // Check if product exists
            const product = await this.productRepository.findOne({
                where: { id: productId },
            });

            if (!product) {
                throw new NotFoundException(
                    `Product with ID ${productId} not found`,
                );
            }

            // Check if already in wishlist
            const existingItem = await this.wishlistRepository.findOne({
                where: {
                    customer_id: customerId,
                    product_id: productId,
                },
            });

            if (existingItem) {
                throw new ConflictException(
                    'Product is already in your wishlist',
                );
            }

            // Add to wishlist
            const wishlistItem = this.wishlistRepository.create({
                customer_id: customerId,
                product_id: productId,
            });

            await this.wishlistRepository.save(wishlistItem);

            return { message: 'Product added to wishlist successfully' };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ConflictException
            ) {
                throw error;
            }
            console.error('Error adding to wishlist:', error);
            throw new Error('Failed to add product to wishlist');
        }
    }

    async removeFromWishlist(
        customerId: number,
        productId: string,
    ): Promise<{ message: string }> {
        try {
            const result = await this.wishlistRepository.delete({
                customer_id: customerId,
                product_id: productId,
            });

            if (result.affected === 0) {
                throw new NotFoundException('Product not found in wishlist');
            }

            return { message: 'Product removed from wishlist successfully' };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            console.error('Error removing from wishlist:', error);
            throw new Error('Failed to remove product from wishlist');
        }
    }

    async isInWishlist(
        customerId: number,
        productId: string,
    ): Promise<boolean> {
        try {
            const item = await this.wishlistRepository.findOne({
                where: {
                    customer_id: customerId,
                    product_id: productId,
                },
            });

            return !!item;
        } catch (error) {
            console.error('Error checking wishlist:', error);
            throw new Error('Failed to check if product is in wishlist');
        }
    }
}
