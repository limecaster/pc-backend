import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    Repository,
    ILike,
    In,
    MoreThanOrEqual,
    LessThanOrEqual,
    Between,
} from 'typeorm';
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
        subcategoryFilteredIds?: string[],
    ): Promise<{
        products: Product[];
        total: number;
        pages: number;
        page: number;
    }> {
        try {
            const offset = (page - 1) * limit;

            // Add category to where clause if provided
            if (category) {
                whereClause.category = category;
            }

            // Add status filter
            whereClause.status = 'active';

            // If we have IDs from subcategory filtering, use them
            if (subcategoryFilteredIds) {
                whereClause.id = In(subcategoryFilteredIds);
            }

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
                `Error finding products by category: ${error.message}`,
            );
            throw new Error('Failed to find products by category');
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
