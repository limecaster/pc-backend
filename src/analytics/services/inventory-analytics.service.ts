import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../product/product.entity';

@Injectable()
export class InventoryAnalyticsService {
    private readonly logger = new Logger(InventoryAnalyticsService.name);

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

            // Define thresholds
            const LOW_STOCK_THRESHOLD = 5; // Near out-of-stock threshold
            const EXCESS_STOCK_THRESHOLD = 50;

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
                } else if (stockQuantity <= LOW_STOCK_THRESHOLD) {
                    lowStock++;
                    lowStockItems.push({
                        id: product.id, // Use actual product ID
                        name: product.name,
                        stock: stockQuantity,
                        threshold: LOW_STOCK_THRESHOLD,
                    });
                } else if (stockQuantity >= EXCESS_STOCK_THRESHOLD) {
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
                categories: Array.from(categoryMap.values())
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 6), // Top 6 categories
                lowStockItems: lowStockItems.slice(0, 5), // Top 5 low stock items
                outOfStockItems: outOfStockItems.slice(0, 5), // Top 5 out of stock items
            };
        } catch (error) {
            this.logger.error(
                `Error getting inventory report: ${error.message}`,
            );
            throw error;
        }
    }
}
