import { Injectable, NotFoundException } from '@nestjs/common';
import { PostgresConfigService } from '../../config/postgres.config';
import { Neo4jConfigService } from '../../config/neo4j.config';
import {
    ProductDetailsDto,
    ProductSpecDto,
    ReviewDto,
} from './dto/product-response.dto';

@Injectable()
export class ProductService {
    constructor(
        private readonly postgresConfigService: PostgresConfigService,
        private readonly neo4jConfigService: Neo4jConfigService,
    ) {}

    async findBySlug(slug: string): Promise<ProductDetailsDto> {
        const pool = this.postgresConfigService.getPool();

        try {
            // Extract product ID from slug (assuming slug format is "id-product-name")
            const id = slug.split('-')[0];
            // Query to get product details
            const productQuery = `
        SELECT 
          p.id, p.name, p.description, p.price, 
          p.category
        FROM 
          Product p
        WHERE 
          p.id = $1
      `;

            const productResult = await pool.query(productQuery, [id]);

            if (productResult.rows.length === 0) {
                throw new NotFoundException(`Product with ID ${id} not found`);
            }

            const product = productResult.rows[0];

            // Query to get product specifications
            const specificationsQuery = `
        SELECT name, value FROM product_specifications WHERE product_id = $1
      `;

            const specificationsResult = await pool.query(specificationsQuery, [
                id,
            ]);
            const specifications =
                specificationsResult.rows as ProductSpecDto[];

            // Query to get product reviews
            const reviewsQuery = `
        SELECT 
          rc.id, 
          CONCAT(c.firstname, ' ', c.lastname) as username,
          rc.stars as rating,
          TO_CHAR(rc.created_at, 'DD/MM/YYYY') as date,
          rc.comment as content,
          c.avatar
        FROM 
          Rating_Comment rc
        JOIN 
          Customer c ON rc.customer_id = c.id
        WHERE 
          rc.product_id = $1
        ORDER BY 
          rc.created_at DESC
      `;

            const reviewsResult = await pool.query(reviewsQuery, [id]);
            const reviews = reviewsResult.rows as ReviewDto[];

            // Calculate average rating
            const avgRatingQuery = `
        SELECT AVG(stars) as avg_rating, COUNT(*) as count
        FROM Rating_Comment
        WHERE product_id = $1
      `;

            const ratingResult = await pool.query(avgRatingQuery, [id]);
            const rating = ratingResult.rows[0].avg_rating || 0;
            const reviewCount = parseInt(ratingResult.rows[0].count) || 0;

            // Parse additional images if they exist
            let additionalImages = [];
            if (product.additional_images) {
                try {
                    additionalImages = JSON.parse(product.additional_images);
                } catch (e) {
                    console.error('Error parsing additional images:', e);
                }
            }

            // Map database result to DTO
            const productDetails: ProductDetailsDto = {
                id: product.id.toString(),
                name: product.name,
                price: parseFloat(product.price),
                originalPrice: product.original_price
                    ? parseFloat(product.original_price)
                    : undefined,
                discount: product.discount
                    ? parseFloat(product.discount)
                    : undefined,
                rating: parseFloat(rating) || 0,
                reviewCount: reviewCount,
                description: product.description || '',
                additionalInfo: product.additional_info || undefined,
                imageUrl: product.image_url || '',
                additionalImages: additionalImages,
                specifications: specifications || [],
                reviews: reviews || [],
                sku: product.sku || '',
                stock: product.stock_quantity > 0 ? 'Còn hàng' : 'Hết hàng',
                brand: product.brand || '',
                category: product.category || '',
                color: product.color || undefined,
                size: product.size || undefined,
            };

            return productDetails;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            console.error('Error fetching product:', error);
            throw new Error('Failed to fetch product details');
        }
    }

    async importProductsFromNeo4j(): Promise<{
        success: boolean;
        count: number;
        message: string;
    }> {
        const neo4jDriver = this.neo4jConfigService.getDriver();
        const pgPool = this.postgresConfigService.getPool();
        const session = neo4jDriver.session();
        let importedCount = 0;

        try {
            // Query Neo4j for product data (id, name, price, category)
            const result = await session.run(
                'MATCH (p) RETURN p.id AS id, p.name AS name, p.price AS price, labels(p) AS category',
            );

            // Check if products were found
            if (result.records.length === 0) {
                return {
                    success: false,
                    count: 0,
                    message: 'No products found in Neo4j database',
                };
            }

            // Begin PostgreSQL transaction
            const pgClient = await pgPool.connect();
            try {
                await pgClient.query('BEGIN');

                for (const record of result.records) {
                    const id = record.get('id');
                    const name = record.get('name');
                    const price = parseFloat(record.get('price'));
                    const category = record.get('category')[0]; // Assuming the first label is the category

                    // Check if product already exists in PostgreSQL by ID
                    const checkQuery = 'SELECT id FROM Product WHERE id = $1';
                    const checkResult = await pgClient.query(checkQuery, [id]);

                    if (checkResult.rowCount > 0) {
                        // Update existing product
                        const updateQuery = `
          UPDATE Product 
          SET name = $2, price = $3, category = $4, updated_at = NOW() 
          WHERE id = $1
        `;
                        await pgClient.query(updateQuery, [
                            id,
                            name,
                            price,
                            category,
                        ]);
                    } else {
                        // Insert new product with minimal required fields
                        const insertQuery = `
          INSERT INTO Product (
          id, name, price, stock_quantity, status, category
          ) VALUES (
          $1, $2, $3, 0, 'active', $4
          )
        `;
                        await pgClient.query(insertQuery, [
                            id,
                            name,
                            price,
                            category,
                        ]);
                    }
                    importedCount++;
                }

                await pgClient.query('COMMIT');
                return {
                    success: true,
                    count: importedCount,
                    message: `Successfully imported ${importedCount} products from Neo4j to PostgreSQL`,
                };
            } catch (error) {
                await pgClient.query('ROLLBACK');
                console.error('Error during PostgreSQL transaction:', error);
                throw new Error('Failed to import products to PostgreSQL');
            } finally {
                pgClient.release();
            }
        } catch (error) {
            console.error('Error importing products from Neo4j:', error);
            throw new Error('Failed to import products from Neo4j');
        } finally {
            await session.close();
        }
    }
}
