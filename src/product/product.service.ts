import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { PostgresConfigService } from '../../config/postgres.config';
import { Neo4jConfigService } from '../../config/neo4j.config';
import {
    ProductDetailsDto,
    ProductSpecDto,
    ReviewDto,
} from './dto/product-response.dto';
import { UtilsService } from 'service/utils.service';

@Injectable()
export class ProductService {
    constructor(
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        private readonly postgresConfigService: PostgresConfigService,
        private readonly neo4jConfigService: Neo4jConfigService,
        private readonly utilsService: UtilsService,
    ) {}

    async findBySlug(slug: string): Promise<ProductDetailsDto> {
        const pool = this.postgresConfigService.getPool();
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        try {
            // Extract product ID from slug
            const id = slug;
            
            // Use TypeORM to fetch product
            const product = await this.productRepository.findOne({
                where: { id }
            });

            if (!product) {
                throw new NotFoundException(`Product with ID ${id} not found`);
            }

            // Query to get product specifications
            const specificationsQuery = `
                MATCH (p {id: $id}) RETURN p AS product
            `;

            const specificationsResult = await session.run(
                specificationsQuery,
                {
                    id: id,
                },
            );
            const specifications = specificationsResult.records.map(
                (record) => {
                    const properties = record.get('product').properties;
                    for (const key in properties) {
                        if (
                        properties[key] &&
                        typeof properties[key] === 'object' &&
                        'low' in properties[key] &&
                        'high' in properties[key]
                        ) {
                        properties[key] = this.utilsService.combineLowHigh(
                            properties[key].low,
                            properties[key].high,
                        );
                        }
                    }
                    return properties;
                },
            )[0] as ProductSpecDto;

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
                "Rating_Comment" rc
                JOIN 
                "Customer" c ON rc.customer_id = c.id
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
                FROM "Rating_Comment"
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
                price: parseFloat(product.price.toString()),
                originalPrice: product.originalPrice
                    ? parseFloat(product.originalPrice.toString())
                    : undefined,
                discount: product.discount
                    ? parseFloat(product.discount.toString())
                    : undefined,
                rating: parseFloat(rating) || 0,
                reviewCount: reviewCount,
                description: product.description || '',
                additionalInfo: product.additionalInfo || undefined,
                imageUrl: specifications['imageUrl'] || '',
                additionalImages: additionalImages,
                specifications: specifications || undefined,
                reviews: reviews || [],
                sku: product.id || '',
                stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
                brand: specifications['manufacturer'] || '',
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
        } finally {
            if (session) await session.close();
        }
    }

    async findByCategory(category: string): Promise<ProductDetailsDto[]> {
        const pool = this.postgresConfigService.getPool();
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        try {
            // Use TypeORM to fetch products by category
            const products = await this.productRepository.find({
                where: { category },
                order: { createdAt: 'DESC' }
            });

            const productDetails: ProductDetailsDto[] = [];

            for (const product of products) {
                const specificationsQuery = `
                    MATCH (p {id: $id}) RETURN p AS product
                `;

                const specificationsResult = await session.run(
                    specificationsQuery,
                    {
                        id: product.id,
                    },
                );
                const specifications = specificationsResult.records.map(
                    (record) => record.get('product').properties,
                )[0] as ProductSpecDto;

                const avgRatingQuery = `
                    SELECT AVG(stars) as avg_rating, COUNT(*) as count
                    FROM "Rating_Comment"
                    WHERE product_id = $1
                `;

                const ratingResult = await pool.query(avgRatingQuery, [product.id]);
                const rating = ratingResult.rows[0].avg_rating || 0;
                const reviewCount = parseInt(ratingResult.rows[0].count) || 0;

                productDetails.push({
                    id: product.id.toString(),
                    name: product.name,
                    price: parseFloat(product.price.toString()),
                    rating: parseFloat(rating) || 0,
                    reviewCount: reviewCount,
                    imageUrl: specifications['imageUrl'] || '',
                    description: '',
                    specifications: specifications || undefined,
                    sku: '',
                    stock: '',
                    brand: '',
                    category: ''
                });
            }

            return productDetails;
        } catch (error) {
            console.error('Error fetching products by category:', error);
            throw new Error('Failed to fetch products by category');
        } finally {
            if (session) await session.close();
        }
    }

    async importProductsFromNeo4j(): Promise<{
        success: boolean;
        count: number;
        message: string;
    }> {
        const neo4jDriver = this.neo4jConfigService.getDriver();
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

            for (const record of result.records) {
                const id = record.get('id');
                const name = record.get('name');
                const price = parseFloat(record.get('price'));
                const category = record.get('category')[0]; // Assuming the first label is the category

                // Check if product already exists in PostgreSQL by ID
                const existingProduct = await this.productRepository.findOne({
                    where: { id }
                });

                if (existingProduct) {
                    // Update existing product
                    existingProduct.name = name;
                    existingProduct.price = price;
                    existingProduct.category = category;
                    await this.productRepository.save(existingProduct);
                } else {
                    // Create new product
                    const newProduct = this.productRepository.create({
                        id,
                        name,
                        price,
                        stockQuantity: 0,
                        status: 'active',
                        category
                    });
                    await this.productRepository.save(newProduct);
                }
                importedCount++;
            }

            return {
                success: true,
                count: importedCount,
                message: `Successfully imported ${importedCount} products from Neo4j to PostgreSQL`,
            };
        } catch (error) {
            console.error('Error importing products from Neo4j:', error);
            throw new Error('Failed to import products from Neo4j');
        } finally {
            await session.close();
        }
    }

    async getLandingPageProducts(): Promise<ProductDetailsDto[]> {
        const pool = this.postgresConfigService.getPool();
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        try {
            // Use TypeORM to fetch products
            const products = await this.productRepository.find({
                where: { category: 'CPU' },
                order: { createdAt: 'DESC' },
                take: 8
            });

            const productDetails: ProductDetailsDto[] = [];
            for (const product of products) {
                const specificationsQuery = `
                    MATCH (p {id: $id}) RETURN p AS product
                `;

                const specificationsResult = await session.run(
                    specificationsQuery,
                    {
                        id: product.id,
                    },
                );
                const specifications = specificationsResult.records.map(
                    (record) => record.get('product').properties,
                )[0] as ProductSpecDto;

                const avgRatingQuery = `
                    SELECT AVG(stars) as avg_rating, COUNT(*) as count
                    FROM "Rating_Comment"
                    WHERE product_id = $1
                `;

                const ratingResult = await pool.query(avgRatingQuery, [product.id]);
                const rating = ratingResult.rows[0].avg_rating || 0;
                const reviewCount = parseInt(ratingResult.rows[0].count) || 0;

                productDetails.push({
                    id: product.id.toString(),
                    name: product.name,
                    price: parseFloat(product.price.toString()),
                    rating: parseFloat(rating) || 0,
                    reviewCount: reviewCount,
                    imageUrl: specifications['imageUrl'] || '',
                    description: '',
                    specifications: specifications || undefined,
                    sku: '',
                    stock: '',
                    brand: '',
                    category: ''
                });
            }
            return productDetails;
        } catch (error) {
            console.error('Error fetching landing page products:', error);
            throw new Error('Failed to fetch landing page products');
        } finally {
            if (session) await session.close();
        }
    }
}
