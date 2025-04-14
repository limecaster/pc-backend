import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { Product } from '../../product/product.entity';

@Injectable()
export class InventoryAnalyticsService {
    private readonly logger = new Logger(InventoryAnalyticsService.name);

    // Define thresholds as class constants
    private readonly LOW_STOCK_THRESHOLD = 5; // Near out-of-stock threshold
    private readonly EXCESS_STOCK_THRESHOLD = 50;

    constructor(
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
    ) {}

    async getInventoryReport() {
        try {
            // Get all products
            const products = await this.productRepository.find();

            // Calculate inventory summary
            const totalProducts = products.length;
            let totalValue = 0;
            let outOfStock = 0;
            let lowStock = 0;
            let excessStock = 0;

            // Categorize products
            const categoryMap = new Map();
            const lowStockItems = [];
            const outOfStockItems = [];

            products.forEach((product) => {
                // Handle possible string value for price (from database)
                const price =
                    typeof product.price === 'string'
                        ? parseFloat(product.price)
                        : product.price || 0;
                const stockQuantity =
                    typeof product.stockQuantity === 'string'
                        ? parseInt(product.stockQuantity, 10)
                        : product.stockQuantity || 0;

                // Calculate total value - ensure we handle large numbers correctly
                const productValue = price * stockQuantity;
                totalValue += productValue;

                // Categorize by stock level
                if (stockQuantity === 0) {
                    outOfStock++;
                    outOfStockItems.push({
                        id: product.id, // Use actual product ID
                        name: product.name,
                        lastInStock:
                            product.updatedAt?.toLocaleDateString('vi-VN') ||
                            'Unknown',
                    });
                } else if (stockQuantity <= this.LOW_STOCK_THRESHOLD) {
                    lowStock++;
                    lowStockItems.push({
                        id: product.id, // Use actual product ID
                        name: product.name,
                        stock: stockQuantity,
                        threshold: this.LOW_STOCK_THRESHOLD,
                    });
                } else if (stockQuantity >= this.EXCESS_STOCK_THRESHOLD) {
                    excessStock++;
                }

                // Group by category
                const category = product.category || 'Uncategorized';
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, {
                        name: category,
                        count: 0,
                        value: 0,
                    });
                }

                const categoryData = categoryMap.get(category);
                categoryData.count++;
                categoryData.value += productValue;
            });

            return {
                summary: {
                    totalProducts,
                    totalValue,
                    outOfStock,
                    lowStock,
                    excessStock,
                },
                categories: Array.from(categoryMap.values()).sort(
                    (a, b) => b.value - a.value,
                ),
                lowStockItems: lowStockItems.slice(0, 5), // Preview: top 5 low stock items
                outOfStockItems: outOfStockItems.slice(0, 5), // Preview: top 5 out of stock items
            };
        } catch (error) {
            this.logger.error(
                `Error getting inventory report: ${error.message}`,
            );
            throw error;
        }
    }

    async getLowStockProducts(page = 1, limit = 10, search = '') {
        try {
            // Create query builder to handle the complex condition
            const queryBuilder =
                this.productRepository.createQueryBuilder('product');

            // Add the stock threshold condition
            queryBuilder.where(
                'product.stockQuantity > 0 AND product.stockQuantity <= :threshold',
                { threshold: this.LOW_STOCK_THRESHOLD },
            );

            // Add search condition if provided
            if (search) {
                queryBuilder.andWhere('product.name ILIKE :search', {
                    search: `%${search}%`,
                });
            }

            // Add pagination
            queryBuilder.skip((page - 1) * limit).take(limit);

            // Order by stock quantity
            queryBuilder.orderBy('product.stockQuantity', 'ASC');

            // Get results
            const [products, total] = await queryBuilder.getManyAndCount();

            return {
                items: products.map((product) => ({
                    id: product.id,
                    name: product.name,
                    stock: product.stockQuantity,
                    threshold: this.LOW_STOCK_THRESHOLD,
                    category: product.category,
                    price: product.price,
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            this.logger.error(
                `Error getting low stock products: ${error.message}`,
            );
            throw error;
        }
    }

    async getOutOfStockProducts(page = 1, limit = 10, search = '') {
        try {
            // Create query builder
            const queryBuilder =
                this.productRepository.createQueryBuilder('product');

            // Add the out of stock condition
            queryBuilder.where('product.stockQuantity = 0');

            // Add search condition if provided
            if (search) {
                queryBuilder.andWhere('product.name ILIKE :search', {
                    search: `%${search}%`,
                });
            }

            // Add pagination
            queryBuilder.skip((page - 1) * limit).take(limit);

            // Order by last updated date
            queryBuilder.orderBy('product.updatedAt', 'DESC');

            // Get results
            const [products, total] = await queryBuilder.getManyAndCount();

            return {
                items: products.map((product) => ({
                    id: product.id,
                    name: product.name,
                    lastInStock:
                        product.updatedAt?.toLocaleDateString('vi-VN') ||
                        'Unknown',
                    category: product.category,
                    price: product.price,
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            this.logger.error(
                `Error getting out of stock products: ${error.message}`,
            );
            throw error;
        }
    }

    async getProductCategories() {
        try {
            // Get products grouped by category
            const products = await this.productRepository.find();

            // Group and calculate values
            const categoryMap = new Map();

            products.forEach((product) => {
                const price =
                    typeof product.price === 'string'
                        ? parseFloat(product.price)
                        : product.price || 0;

                const stockQuantity =
                    typeof product.stockQuantity === 'string'
                        ? parseInt(product.stockQuantity, 10)
                        : product.stockQuantity || 0;

                const productValue = price * stockQuantity;
                const category = product.category || 'Uncategorized';

                if (!categoryMap.has(category)) {
                    categoryMap.set(category, {
                        name: category,
                        count: 0,
                        value: 0,
                    });
                }

                const categoryData = categoryMap.get(category);
                categoryData.count++;
                categoryData.value += productValue;
            });

            return Array.from(categoryMap.values()).sort(
                (a, b) => b.value - a.value,
            );
        } catch (error) {
            this.logger.error(
                `Error getting product categories: ${error.message}`,
            );
            throw error;
        }
    }
}
