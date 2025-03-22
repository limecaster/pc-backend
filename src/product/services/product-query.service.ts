import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product } from '../product.entity';

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
                this.logger.log(
                    'Empty product IDs array provided, returning empty results',
                );
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

            // Add product IDs filter if provided - THIS IS CRITICAL FOR SUBCATEGORY FILTERING
            if (
                Array.isArray(filteredProductIds) &&
                filteredProductIds.length > 0
            ) {
                this.logger.log(
                    `Adding ID filter with ${filteredProductIds.length} product IDs`,
                );

                // Ensure IDs are strings and not duplicated
                const uniqueStringIds = [
                    ...new Set(filteredProductIds.map((id) => String(id))),
                ];

                // Print a few sample IDs for debugging
                this.logger.log(
                    `Sample IDs: ${uniqueStringIds.slice(0, 3).join(', ')}...`,
                );

                // Use parameterized query with explicit parameter name
                queryBuilder.andWhere('product.id IN (:...filteredIds)', {
                    filteredIds: uniqueStringIds,
                });
            }

            // Count total results for pagination - must be done after all filters are applied
            const totalCount = await queryBuilder.getCount();
            this.logger.log(
                `Query will return a total of ${totalCount} results`,
            );

            // Add pagination and ordering
            queryBuilder
                .orderBy('product.createdAt', 'DESC')
                .skip(offset)
                .take(limit);

            // Log the raw SQL for debugging with all parameters
            const rawQuery = queryBuilder.getSql();
            this.logger.log(`Generated SQL query: ${rawQuery}`);

            const parameters = queryBuilder.getParameters();
            this.logger.log(`Query parameters: ${JSON.stringify(parameters)}`);

            // Execute query
            const products = await queryBuilder.getMany();

            this.logger.log(
                `Query returned ${products.length} products out of ${totalCount} total`,
            );

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
}
