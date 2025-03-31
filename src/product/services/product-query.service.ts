import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Product } from '../product.entity';
import { ProductDetailsDto } from '../dto/product-response.dto';

@Injectable()
export class ProductQueryService {
    private readonly logger = new Logger(ProductQueryService.name);

    constructor(
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
    ) {}

    async findByCategory(
        category?: string,
        page: number = 1,
        limit: number = 12,
        whereClause: any = {},
        filteredProductIds?: string[],
    ): Promise<{
        products: Product[];
        total: number;
        pages: number;
        page: number;
    }> {
        try {
            // If we have product IDs filter but it's empty, return empty result
            if (
                Array.isArray(filteredProductIds) &&
                filteredProductIds.length === 0
            ) {
                return {
                    products: [],
                    total: 0,
                    pages: 0,
                    page,
                };
            }

            const offset = (page - 1) * limit;
            const queryBuilder =
                this.productRepository.createQueryBuilder('product');

            // Add status filter
            queryBuilder.where('product.status = :status', {
                status: 'active',
            });

            // Add category filter if provided
            if (category) {
                queryBuilder.andWhere('product.category = :category', {
                    category,
                });
            }

            // Add price filters if provided
            if (whereClause.price_gte !== undefined) {
                queryBuilder.andWhere('product.price >= :minPrice', {
                    minPrice: whereClause.price_gte,
                });
            }

            if (whereClause.price_lte !== undefined) {
                queryBuilder.andWhere('product.price <= :maxPrice', {
                    maxPrice: whereClause.price_lte,
                });
            }

            // Add product IDs filter if provided
            if (
                Array.isArray(filteredProductIds) &&
                filteredProductIds.length > 0
            ) {
                // Ensure IDs are strings and not duplicated
                const uniqueStringIds = [
                    ...new Set(filteredProductIds.map((id) => String(id))),
                ];

                queryBuilder.andWhere('product.id IN (:...filteredIds)', {
                    filteredIds: uniqueStringIds,
                });
            }

            // Count total results for pagination
            const totalCount = await queryBuilder.getCount();

            // Add pagination and ordering
            queryBuilder
                .orderBy('product.createdAt', 'DESC')
                .skip(offset)
                .take(limit);

            // Execute query
            const products = await queryBuilder.getMany();

            return {
                products,
                total: totalCount,
                pages: Math.ceil(totalCount / limit),
                page,
            };
        } catch (error) {
            this.logger.error(
                `Error finding products by category: ${error.message}`,
            );
            throw error;
        }
    }

    async searchByName(
        query: string,
        page: number = 1,
        limit: number = 12,
        whereClause: any = {},
    ): Promise<{
        products: Product[];
        total: number;
        pages: number;
        page: number;
    }> {
        try {
            const offset = (page - 1) * limit;

            // Add search term
            whereClause.name = ILike(`%${query}%`);

            // Add status filter
            whereClause.status = 'active';

            const totalCount = await this.productRepository.count({
                where: whereClause,
            });

            const products = await this.productRepository.find({
                where: whereClause,
                order: { createdAt: 'DESC' },
                skip: offset,
                take: limit,
            });

            return {
                products,
                total: totalCount,
                pages: Math.ceil(totalCount / limit),
                page,
            };
        } catch (error) {
            this.logger.error(
                `Error searching products by name: ${error.message}`,
            );
            throw new Error('Failed to search products by name');
        }
    }

    async getAllCategories(): Promise<string[]> {
        try {
            const result = await this.productRepository
                .createQueryBuilder('product')
                .select('DISTINCT product.category', 'category')
                .where('product.category IS NOT NULL')
                .orderBy('category', 'ASC')
                .getRawMany();

            return result.map((item) => item.category);
        } catch (error) {
            this.logger.error('Error fetching categories:', error);
            throw new Error('Failed to fetch categories');
        }
    }

    async getLandingPageProducts(): Promise<Product[]> {
        try {
            return await this.productRepository.find({
                where: { status: 'active' },
                order: { createdAt: 'DESC' },
                take: 8,
            });
        } catch (error) {
            this.logger.error('Error fetching landing page products:', error);
            throw new Error('Failed to fetch landing page products');
        }
    }

    async findAllProductsForAdmin(
        page: number = 1,
        limit: number = 12,
        sortBy: string = 'createdAt',
        sortOrder: 'ASC' | 'DESC' = 'DESC',
    ): Promise<{
        products: Product[];
        total: number;
        pages: number;
        page: number;
    }> {
        try {
            const offset = (page - 1) * limit;
            const totalCount = await this.productRepository.count();

            const products = await this.productRepository.find({
                order: { [sortBy]: sortOrder },
                skip: offset,
                take: limit,
            });

            return {
                products,
                total: totalCount,
                pages: Math.ceil(totalCount / limit),
                page,
            };
        } catch (error) {
            this.logger.error(
                `Error finding all products for admin: ${error.message}`,
            );
            throw new Error('Failed to find all products for admin');
        }
    }

    /**
     * Get multiple products by IDs with basic information
     * This method fetches products by IDs for batch processing
     * @param productIds Array of product IDs to fetch
     * @returns Array of products with basic information
     */
    async getProductsWithDiscounts(
        productIds: string[],
    ): Promise<ProductDetailsDto[]> {
        try {
            if (!productIds || productIds.length === 0) {
                return [];
            }

            // Get products from database
            const products = await this.productRepository.find({
                where: { id: In(productIds), status: 'active' },
            });

            if (!products || products.length === 0) {
                return [];
            }

            // Transform to ProductDetailsDto with minimum necessary fields
            const productDtos = products.map((product) => {
                return {
                    id: product.id.toString(),
                    name: product.name,
                    price: parseFloat(product.price.toString()),
                    originalPrice: product.originalPrice
                        ? parseFloat(product.originalPrice.toString())
                        : undefined,
                    discount: product.discount
                        ? parseFloat(product.discount.toString())
                        : undefined,
                    category: product.category || '',
                    stockQuantity: product.stockQuantity,
                    description: product.description || '',
                    sku: product.id || '',
                    stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
                    rating: 0,
                    reviewCount: 0,
                    imageUrl: '',
                    specifications: {},
                    brand: '',
                };
            });

            return productDtos as unknown as ProductDetailsDto[];
        } catch (error) {
            this.logger.error(
                `Error getting products with discounts: ${error.message}`,
            );
            throw new Error(
                `Failed to get products with discounts: ${error.message}`,
            );
        }
    }
}
