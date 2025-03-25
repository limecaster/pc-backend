import { Injectable } from '@nestjs/common';
import { PostgresConfigService } from '../../../config/postgres.config';
import { ReviewDto } from '../dto/product-response.dto';

@Injectable()
export class ProductRatingService {
    constructor(
        private readonly postgresConfigService: PostgresConfigService,
    ) {}

    async getReviews(productId: string): Promise<ReviewDto[]> {
        const pool = this.postgresConfigService.getPool();

        try {
            const query = `
                SELECT 
                rc.id, 
                CONCAT(c.firstname, ' ', c.lastname) as username,
                rc.stars as rating,
                TO_CHAR(rc.created_at, 'DD/MM/YYYY') as date,
                rc.comment as content,
                c.avatar
                FROM 
                "Rating_Comment" rc
                JOIN 
                "Customer" c ON rc.customer_id = c.id
                WHERE 
                rc.product_id = $1
                ORDER BY 
                rc.created_at DESC
            `;

            const result = await pool.query(query, [productId]);
            return result.rows as ReviewDto[];
        } catch (error) {
            throw new Error(`Failed to get reviews for product ${productId}`);
        }
    }

    async getRating(
        productId: string,
    ): Promise<{ rating: number; reviewCount: number }> {
        const pool = this.postgresConfigService.getPool();

        try {
            const query = `
                SELECT AVG(stars) as avg_rating, COUNT(*) as count
                FROM "Rating_Comment"
                WHERE product_id = $1
            `;

            const result = await pool.query(query, [productId]);
            const rating = parseFloat(result.rows[0].avg_rating) || 0;
            const reviewCount = parseInt(result.rows[0].count) || 0;

            return { rating, reviewCount };
        } catch (error) {
            throw new Error(`Failed to get rating for product ${productId}`);
        }
    }

    async getProductIdsByMinRating(minRating: number): Promise<string[]> {
        const pool = this.postgresConfigService.getPool();

        try {
            const query = `
                SELECT product_id, AVG(stars) as avg_rating
                FROM "Rating_Comment"
                GROUP BY product_id
                HAVING AVG(stars) >= $1
            `;

            const result = await pool.query(query, [minRating]);
            return result.rows.map((row) => row.product_id);
        } catch (error) {
            throw new Error('Failed to get product IDs by minimum rating');
        }
    }

    /**
     * Get ratings for multiple products in one query
     * Prevents N+1 query problem by batching rating lookups
     */
    async getRatingsInBatch(productIds: string[]): Promise<Record<string, { rating: number; reviewCount: number }>> {
        if (!productIds || productIds.length === 0) {
            return {};
        }
        
        const pool = this.postgresConfigService.getPool();

        try {
            // Use a parameterized query with ANY to batch fetch multiple ratings
            const query = `
                SELECT 
                    product_id, 
                    AVG(stars) as avg_rating, 
                    COUNT(*) as count
                FROM "Rating_Comment"
                WHERE product_id = ANY($1)
                GROUP BY product_id
            `;

            const result = await pool.query(query, [productIds]);
            
            // Create a map of product ID -> rating data
            const ratingsMap: Record<string, { rating: number; reviewCount: number }> = {};
            
            // Initialize all requested products with default values
            productIds.forEach(id => {
                ratingsMap[id] = { rating: 0, reviewCount: 0 };
            });
            
            // Update with actual values for products that have ratings
            result.rows.forEach(row => {
                ratingsMap[row.product_id] = { 
                    rating: parseFloat(row.avg_rating) || 0,
                    reviewCount: parseInt(row.count) || 0 
                };
            });
            
            return ratingsMap;
        } catch (error) {
            throw new Error(`Failed to batch fetch ratings: ${error.message}`);
        }
    }
}
