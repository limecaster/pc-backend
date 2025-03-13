import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
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
    private readonly logger = new Logger(ProductService.name);

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
            
            // Use TypeORM to fetch product - add status filter
            const product = await this.productRepository.findOne({
                where: { id, status: "active" }
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

    async findByCategory(
        category?: string, 
        page: number = 1, 
        limit: number = 12,
        brands?: string[],
        minPrice?: number,
        maxPrice?: number,
        minRating?: number
    ): Promise<{
        products: ProductDetailsDto[],
        total: number,
        pages: number,
        page: number
    }> {
        const pool = this.postgresConfigService.getPool();
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        
        try {
            // Calculate offset for pagination
            const offset = (page - 1) * limit;
            
            // Get product IDs that meet the rating filter if a minimum rating is specified
            let ratingFilteredIds: string[] | null = null;
            if (minRating !== undefined && minRating > 0) {
                const ratingQuery = `
                    SELECT product_id, AVG(stars) as avg_rating
                    FROM "Rating_Comment"
                    GROUP BY product_id
                    HAVING AVG(stars) >= $1
                `;
                const ratingResult = await pool.query(ratingQuery, [minRating]);
                ratingFilteredIds = ratingResult.rows.map(row => row.product_id);
                
                // If no products meet the rating criteria, return empty results
                if (ratingFilteredIds.length === 0) {
                    return {
                        products: [],
                        total: 0,
                        pages: 0,
                        page: page
                    };
                }
            }
            
            // If no brand filter, use standard category filtering
            if (!brands || brands.length === 0) {
                // Build where clause with category and price filters
                const whereClause: any = category ? { category, status: "active" } : { status: "active" };
                
                // Add price filtering if provided
                if (minPrice !== undefined && maxPrice !== undefined) {
                    whereClause.price = Between(minPrice, maxPrice);
                } else if (minPrice !== undefined) {
                    whereClause.price = MoreThanOrEqual(minPrice);
                } else if (maxPrice !== undefined) {
                    whereClause.price = LessThanOrEqual(maxPrice);
                }
                
                // Add rating filter if provided
                if (ratingFilteredIds) {
                    whereClause.id = In(ratingFilteredIds);
                }
                
                // Get total count for pagination
                const totalCount = await this.productRepository.count({
                    where: whereClause
                });
                
                // Get paginated products from PostgreSQL
                const products = await this.productRepository.find({
                    where: whereClause,
                    order: { createdAt: 'DESC' },
                    skip: offset,
                    take: limit
                });
                
                const productDetails = await this.enrichProductsWithDetails(products, session, pool);
                
                return {
                    products: productDetails,
                    total: totalCount,
                    pages: Math.ceil(totalCount / limit),
                    page: page
                };
            }
            
            // If we have brand filters, use a more efficient approach
            // First, get product IDs from Neo4j that match the brand filter
            const brandsParam = brands.map(brand => `"${brand}"`).join(', ');
            const neo4jQuery = `
                MATCH (p)
                WHERE p.manufacturer IN [${brandsParam}]
                ${category ? 'AND $category IN labels(p)' : ''}
                RETURN p.id AS id
            `;
            
            const neo4jResult = await session.run(
                neo4jQuery,
                { category: category }
            );
            
            // Extract IDs from Neo4j result
            const matchingIds = neo4jResult.records.map(record => record.get('id'));
            
            // If no matching products found
            if (matchingIds.length === 0) {
                return {
                    products: [],
                    total: 0,
                    pages: 0,
                    page: page
                };
            }
            
            // Query PostgreSQL with these IDs
            const whereClause: any = { id: In(matchingIds), status: "active" };
            if (category) {
                whereClause.category = category;
            }
            
            // Add price filtering if provided
            if (minPrice !== undefined && maxPrice !== undefined) {
                whereClause.price = Between(minPrice, maxPrice);
            } else if (minPrice !== undefined) {
                whereClause.price = MoreThanOrEqual(minPrice);
            } else if (maxPrice !== undefined) {
                whereClause.price = LessThanOrEqual(maxPrice);
            }
            
            // Add rating filter if provided
            if (ratingFilteredIds) {
                // We need to ensure products match both brand and rating criteria
                whereClause.id = In(matchingIds.filter(id => ratingFilteredIds.includes(id)));
            }
            
            const totalCount = await this.productRepository.count({
                where: whereClause
            });
            
            const products = await this.productRepository.find({
                where: whereClause,
                order: { createdAt: 'DESC' },
                skip: offset,
                take: limit
            });
            
            const productDetails = await this.enrichProductsWithDetails(products, session, pool);
            
            return {
                products: productDetails,
                total: totalCount,
                pages: Math.ceil(totalCount / limit),
                page: page
            };
        } catch (error) {
            console.error('Error fetching products by category:', error);
            throw new Error('Failed to fetch products by category');
        } finally {
            if (session) await session.close();
        }
    }
    
    // Helper to enrich products with Neo4j details and ratings
    private async enrichProductsWithDetails(
        products: Product[], 
        session: any, 
        pool: any
    ): Promise<ProductDetailsDto[]> {
        const productDetails: ProductDetailsDto[] = [];
        
        for (const product of products) {
            const specificationsQuery = `
                MATCH (p {id: $id}) RETURN p AS product
            `;

            const specificationsResult = await session.run(
                specificationsQuery,
                { id: product.id }
            );
            
            const specifications = specificationsResult.records.map(
                (record) => record.get('product').properties
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
                description: product.description || '',
                specifications: specifications || undefined,
                brand: specifications['manufacturer'] || '',
                sku: product.id || '',
                stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
                category: product.category || ''
            });
        }
        
        return productDetails;
    }

    async findByName(name: string): Promise<ProductDetailsDto[]> {
        const pool = this.postgresConfigService.getPool();
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        try {
            // Use TypeORM to fetch products by exact name - add status filter
            const products = await this.productRepository.find({
                where: { name, status: "active" },
                order: { createdAt: 'DESC' }
            });

            const productDetails: ProductDetailsDto[] = [];

            for (const product of products) {
                const specificationsQuery = `
                    MATCH (p {id: $id}) RETURN p AS product
                `;

                const specificationsResult = await session.run(
                    specificationsQuery,
                    { id: product.id }
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
                    description: product.description || '',
                    specifications: specifications || undefined,
                    sku: product.id || '',
                    stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
                    brand: specifications['manufacturer'] || '',
                    category: product.category || ''
                });
            }

            return productDetails;
        } catch (error) {
            console.error('Error fetching products by name:', error);
            throw new Error('Failed to fetch products by name');
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
            // Use TypeORM to fetch products - add status filter
            const products = await this.productRepository.find({
                where: { status: "active" },
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
                    { id: product.id }
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
                    description: product.description || '',
                    specifications: specifications || undefined,
                    sku: product.id || '',
                    stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
                    brand: specifications['manufacturer'] || '',
                    category: product.category || ''
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

    async searchByName(
        query: string, 
        page: number = 1, 
        limit: number = 12,
        brands?: string[],
        minPrice?: number,
        maxPrice?: number,
        minRating?: number
    ): Promise<{
        products: ProductDetailsDto[],
        total: number,
        pages: number,
        page: number
    }> {
        try {
            if (!query || query.trim() === '') {
                return {
                    products: [],
                    total: 0,
                    pages: 0,
                    page: page
                };
            }
            
            const pool = this.postgresConfigService.getPool();
            const driver = this.neo4jConfigService.getDriver();
            const session = driver.session();
            
            try {
                // Get product IDs that meet the rating filter if a minimum rating is specified
                let ratingFilteredIds: string[] | null = null;
                if (minRating !== undefined && minRating > 0) {
                    const ratingQuery = `
                        SELECT product_id, AVG(stars) as avg_rating
                        FROM "Rating_Comment"
                        GROUP BY product_id
                        HAVING AVG(stars) >= $1
                    `;
                    const ratingResult = await pool.query(ratingQuery, [minRating]);
                    ratingFilteredIds = ratingResult.rows.map(row => row.product_id);
                    
                    // If no products meet the rating criteria, return empty results
                    if (ratingFilteredIds.length === 0) {
                        return {
                            products: [],
                            total: 0,
                            pages: 0,
                            page: page
                        };
                    }
                }
                
                // If no brand filter, use standard search
                if (!brands || brands.length === 0) {
                    const whereClause: any = { name: ILike(`%${query}%`), status: "active" };
                    
                    // Add rating filter if provided
                    if (ratingFilteredIds) {
                        whereClause.id = In(ratingFilteredIds);
                    }
                    
                    const totalCount = await this.productRepository.count({
                        where: whereClause
                    });
                    
                    const products = await this.productRepository.find({
                        where: whereClause,
                        order: { createdAt: 'DESC' },
                        skip: (page - 1) * limit,
                        take: limit
                    });
                    
                    const productDetails = await this.enrichProductsWithDetails(products, session, pool);
                    
                    return {
                        products: productDetails,
                        total: totalCount,
                        pages: Math.ceil(totalCount / limit),
                        page: page
                    };
                }
                
                // If we have brand filters, optimize the query
                // First, get all matching product IDs from Neo4j by brand
                const brandsParam = brands.map(brand => `"${brand}"`).join(', ');
                const neo4jQuery = `
                    MATCH (p)
                    WHERE p.manufacturer IN [${brandsParam}]
                    RETURN p.id AS id
                `;
                
                const neo4jResult = await session.run(neo4jQuery);
                const matchingIds = neo4jResult.records.map(record => record.get('id'));
                
                // If no matching products found
                if (matchingIds.length === 0) {
                    return {
                        products: [],
                        total: 0,
                        pages: 0,
                        page: page
                    };
                }
                
                // Now query PostgreSQL with these IDs and the search term
                const whereClause: any = {
                    id: In(matchingIds),
                    name: ILike(`%${query}%`),
                    status: "active"
                };
                
                // Add price filtering if provided
                if (minPrice !== undefined && maxPrice !== undefined) {
                    whereClause.price = Between(minPrice, maxPrice);
                } else if (minPrice !== undefined) {
                    whereClause.price = MoreThanOrEqual(minPrice);
                } else if (maxPrice !== undefined) {
                    whereClause.price = LessThanOrEqual(maxPrice);
                }
                
                // Add rating filter if provided
                if (ratingFilteredIds) {
                    // We need to ensure products match both brand and rating criteria
                    whereClause.id = In(matchingIds.filter(id => ratingFilteredIds.includes(id)));
                }
                
                const totalCount = await this.productRepository.count({
                    where: whereClause
                });
                
                const products = await this.productRepository.find({
                    where: whereClause,
                    order: { createdAt: 'DESC' },
                    skip: (page - 1) * limit,
                    take: limit
                });
                
                const productDetails = await this.enrichProductsWithDetails(products, session, pool);
                
                return {
                    products: productDetails,
                    total: totalCount,
                    pages: Math.ceil(totalCount / limit),
                    page: page
                };
            } finally {
                if (session) await session.close();
            }
        } catch (error) {
            throw new Error(`Failed to search products: ${error.message}`);
        }
    }

    async getAllBrands(): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        
        try {
            const result = await session.run(`
                MATCH (p) 
                WHERE p.manufacturer IS NOT NULL
                RETURN DISTINCT p.manufacturer AS brand
                ORDER BY brand
            `);
            
            return result.records.map(record => record.get('brand'));
        } catch (error) {
            console.error('Error fetching brands:', error);
            throw new Error('Failed to fetch brands');
        } finally {
            await session.close();
        }
    }

    async createProduct(productData: any): Promise<any> {
        try {
            // Create product in PostgreSQL database - fix property naming to match entity definition
            const product = this.productRepository.create({
                id: productData.id, // Make sure ID is properly handled
                name: productData.name,
                description: productData.description,
                price: productData.price,
                stockQuantity: productData.stock_quantity, // Ensure this matches entity
                status: productData.status || 'active',
                category: productData.category,
                // These properties might need to be adjusted based on your actual entity definition
                // Remove properties that don't exist in your Product entity
                // Add any required properties that might be missing
            });
        
            const savedProduct = await this.productRepository.save(product);
        
            // If Neo4j integration is being used, store the product there too
            try {
                // Store the product in Neo4j with the Cloudinary image URLs
                await this.storeProductInNeo4j({
                    ...savedProduct,
                    images: productData.images || [],
                    thumbnail: productData.thumbnail || null,
                    specifications: productData.specifications || {},
                });
            } catch (neoError) {
                console.error(`Failed to save product in Neo4j: ${neoError.message}`);
                // Continue even if Neo4j storage fails
            }
        
            return {
                success: true,
                product: savedProduct,
            };
        } catch (error) {
            console.error(`Failed to create product: ${error.message}`);
            throw error;
        }
    }
    
    // Add a method to store product in Neo4j
    private async storeProductInNeo4j(product: any): Promise<void> {
        // This is a placeholder for your actual Neo4j integration code
        // You would need to inject your Neo4j service and call the appropriate methods
        
        // Example pseudo-code:
        // const cypher = `
        //   MERGE (p:Product {id: $id})
        //   SET p.name = $name, 
        //       p.description = $description,
        //       p.price = $price,
        //       p.category = $category,
        //       p.thumbnail = $thumbnail,
        //       p.images = $images,
        //       p.specifications = $specifications
        // `;
        // await this.neo4jService.write(cypher, {
        //   id: product.id,
        //   name: product.name,
        //   description: product.description,
        //   price: product.price,
        //   category: product.category,
        //   thumbnail: product.thumbnail,
        //   images: product.images,
        //   specifications: product.specifications
        // });
        
        // For now, just log the attempt
        this.logger.log(`Storing product ${product.id} in Neo4j with images: ${product.images?.length || 0}`);
    }

    async getAllCategories(): Promise<string[]> {
        try {
            const result = await this.productRepository
                .createQueryBuilder('product')
                .select('DISTINCT product.category', 'category')
                .where('product.category IS NOT NULL')
                .orderBy('category', 'ASC')
                .getRawMany();
            
            return result.map(item => item.category);
        } catch (error) {
            this.logger.error('Error fetching categories:', error);
            throw new Error('Failed to fetch categories');
        }
    }

    async findAllProductsForAdmin(
        page: number = 1, 
        limit: number = 12,
        sortBy: string = 'createdAt',
        sortOrder: 'ASC' | 'DESC' = 'DESC'
    ): Promise<{
        products: ProductDetailsDto[],
        total: number,
        pages: number,
        page: number
    }> {
        const pool = this.postgresConfigService.getPool();
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        
        try {
            // Calculate offset for pagination
            const offset = (page - 1) * limit;
            
            // Get total count for pagination - no status filter
            const totalCount = await this.productRepository.count();
            
            // Get paginated products from PostgreSQL - no status filter
            const products = await this.productRepository.find({
                order: { [sortBy]: sortOrder },
                skip: offset,
                take: limit
            });
            
            const productDetails = await this.enrichProductsWithDetails(products, session, pool);
            
            return {
                products: productDetails,
                total: totalCount,
                pages: Math.ceil(totalCount / limit),
                page: page
            };
        } catch (error) {
            this.logger.error('Error fetching products for admin:', error);
            throw new Error('Failed to fetch products for admin');
        } finally {
            if (session) await session.close();
        }
    }

    async findByIdForAdmin(id: string): Promise<ProductDetailsDto> {
        const pool = this.postgresConfigService.getPool();
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        try {
            // Get product without status filter for admin view
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
                { id }
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

            // Parse additional images if they exist
            let additionalImages = [];
            if (product.additional_images) {
                try {
                    additionalImages = JSON.parse(product.additional_images);
                } catch (e) {
                    console.error('Error parsing additional images:', e);
                }
            }
            
            // Return with stock_quantity for admin editing
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
                rating: 0, // Admin view doesn't need ratings computation
                reviewCount: 0,
                status: product.status,
                stockQuantity: product.stockQuantity,
                description: product.description || '',
                additionalInfo: product.additionalInfo || undefined,
                imageUrl: specifications['imageUrl'] || '',
                additionalImages: additionalImages,
                specifications: specifications || undefined,
                sku: product.id || '',
                brand: specifications['manufacturer'] || '',
                category: product.category || '',
                stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
            };

            return productDetails;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Error fetching product for admin: ${error.message}`);
            throw new Error('Failed to fetch product details');
        } finally {
            if (session) await session.close();
        }
    }
}
