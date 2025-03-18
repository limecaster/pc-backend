import { Injectable, Logger } from '@nestjs/common';
import { PostgresConfigService } from '../../../config/postgres.config';
import { ReviewDto } from '../dto/product-response.dto';

@Injectable()
export class ProductRatingService {
    private readonly logger = new Logger(ProductRatingService.name);

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
            this.logger.error(
                `Error getting reviews for product ${productId}: ${error.message}`,
            );
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
            this.logger.error(
                `Error getting rating for product ${productId}: ${error.message}`,
            );
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
            this.logger.error(
                `Error getting product IDs by minimum rating: ${error.message}`,
            );
            throw new Error('Failed to get product IDs by minimum rating');
        }
    }
}
