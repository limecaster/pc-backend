import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProductDetailsDto } from './dto/product-response.dto';
import { UtilsService } from 'service/utils.service';
import { ProductQueryService } from './services/product-query.service';
import { ProductSpecificationService } from './services/product-specification.service';
import { ProductRatingService } from './services/product-rating.service';
import { ProductElasticsearchService } from './services/product-elasticsearch.service';

@Injectable()
export class ProductService {
    private readonly logger = new Logger(ProductService.name);

    constructor(
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        private readonly productQueryService: ProductQueryService,
        private readonly productSpecService: ProductSpecificationService,
        private readonly productRatingService: ProductRatingService,
        private readonly productElasticsearchService: ProductElasticsearchService,
        private readonly utilsService: UtilsService,
    ) {}

    async findBySlug(slug: string): Promise<ProductDetailsDto> {
        try {
            // Check if id is a valid UUID
            if (!this.utilsService.isValidUUID(slug)) {
                throw new NotFoundException(
                    `Product with ID ${slug} not found`,
                );
            }

            // Use TypeORM to fetch product
            const product = await this.productRepository.findOne({
                where: { id: slug, status: 'active' },
            });

            if (!product) {
                throw new NotFoundException(
                    `Product with ID ${slug} not found`,
                );
            }

            // Get specifications from Neo4j
            const specifications =
                await this.productSpecService.getSpecifications(slug);

            // Get reviews
            const reviews = await this.productRatingService.getReviews(slug);

            // Get rating
            const { rating, reviewCount } =
                await this.productRatingService.getRating(slug);

            // Parse additional images if they exist
            let additionalImages = [];
            if (product.additional_images) {
                try {
                    additionalImages = JSON.parse(product.additional_images);
                } catch (e) {
                    this.logger.error('Error parsing additional images:', e);
                }
            }

            // Map database result to DTO
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
                rating: rating,
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
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Error fetching product: ${error.message}`);
            throw new Error('Failed to fetch product details');
        }
    }

    async findByCategory(
        category?: string,
        page: number = 1,
        limit: number = 12,
        brands?: string[],
        minPrice?: number,
        maxPrice?: number,
        minRating?: number,
        subcategoryFilters?: Record<string, string[]>,
    ): Promise<{
        products: ProductDetailsDto[];
        total: number;
        pages: number;
        page: number;
    }> {
        try {
            // Debug logging for subcategory filters
            if (subcategoryFilters && Object.keys(subcategoryFilters).length > 0) {
                this.logger.log(`Processing subcategory filters: ${JSON.stringify(subcategoryFilters)}`);
            } else {
                this.logger.log('No subcategory filters provided');
            }

            // Build price filter
            const whereClause: any = {};

            // Add price filtering if provided
            if (minPrice !== undefined) {
                whereClause.price_gte = minPrice;
            }

            if (maxPrice !== undefined) {
                whereClause.price_lte = maxPrice;
            }

            let filteredProductIds: string[] | undefined = undefined;

            // First handle subcategory filters if provided
            if (subcategoryFilters && Object.keys(subcategoryFilters).length > 0) {
                this.logger.log(`Getting products with subcategory filters for category: ${category || 'all'}`);
                
                try {
                    const subcategoryFilteredIds = await this.productSpecService.getProductIdsBySubcategoryFilters(
                        category,
                        subcategoryFilters,
                        brands
                    );

                    if (!subcategoryFilteredIds || subcategoryFilteredIds.length === 0) {
                        this.logger.log('No products match the subcategory filters, returning empty result');
                        return { products: [], total: 0, pages: 0, page };
                    }
                    
                    this.logger.log(`Found ${subcategoryFilteredIds.length} products matching the subcategory filters`);
                    if (subcategoryFilteredIds.length > 0) {
                        this.logger.log(`Sample IDs: ${subcategoryFilteredIds.slice(0, 3).join(', ')}...`);
                    }
                    
                    filteredProductIds = subcategoryFilteredIds;
                } catch (error) {
                    this.logger.error(`Error applying subcategory filters: ${error.message}`);
                    throw error;
                }
            } 
            // If no subcategory filters but we have brand filters, handle those
            else if (brands && brands.length > 0) {
                this.logger.debug(`Getting products that match brands: ${brands.join(', ')}`);
                
                const brandFilteredIds = await this.productSpecService.getProductIdsByBrands(
                    brands,
                    category
                );

                if (!brandFilteredIds || brandFilteredIds.length === 0) {
                    this.logger.debug('No products match the brand filters, returning empty result');
                    return { products: [], total: 0, pages: 0, page };
                }

                filteredProductIds = brandFilteredIds;
            }

            // Apply rating filter if provided
            if (minRating !== undefined && minRating > 0) {
                this.logger.debug(`Applying minimum rating filter: ${minRating}`);
                
                const ratingFilteredIds = await this.productRatingService.getProductIdsByMinRating(minRating);

                if (!ratingFilteredIds || ratingFilteredIds.length === 0) {
                    this.logger.debug('No products match the rating filter, returning empty result');
                    return { products: [], total: 0, pages: 0, page };
                }

                // If we already have product IDs from previous filters, we need to find the intersection
                if (filteredProductIds) {
                    filteredProductIds = filteredProductIds.filter(id => 
                        ratingFilteredIds.includes(id)
                    );
                    
                    if (filteredProductIds.length === 0) {
                        this.logger.debug('No products match all filters, returning empty result');
                        return { products: [], total: 0, pages: 0, page };
                    }
                } else {
                    filteredProductIds = ratingFilteredIds;
                }
            }

            // Make sure filteredProductIds is explicitly undefined if not set
            this.logger.log(`Final filter contains ${filteredProductIds ? filteredProductIds.length : 'no'} product IDs`);
            
            // Query for products with filters
            this.logger.log(`Querying database with ${filteredProductIds ? filteredProductIds.length : 'no'} ID filters`);
            if (filteredProductIds && filteredProductIds.length > 0) {
                this.logger.log(`Sample IDs: ${filteredProductIds.slice(0, 3).join(', ')}...`);
            }
            
            const result = await this.productQueryService.findByCategory(
                category,
                page,
                limit,
                whereClause,
                filteredProductIds || undefined
            );

            this.logger.debug(`Database returned ${result.products.length} products out of ${result.total} total matching products`);

            // Enrich products with details
            const productDetails = await this.enrichProductsWithDetails(
                result.products,
            );

            return {
                products: productDetails,
                total: result.total,
                pages: result.pages,
                page: result.page,
            };
        } catch (error) {
            this.logger.error(
                `Error finding products by category: ${error.message}`,
            );
            throw new Error(`Failed to find products by category: ${error.message}`);
        }
    }

    // Helper to enrich products with Neo4j details and ratings
    private async enrichProductsWithDetails(
        products: Product[],
    ): Promise<ProductDetailsDto[]> {
        const productDetails: ProductDetailsDto[] = [];

        for (const product of products) {
            const specifications =
                await this.productSpecService.getSpecifications(product.id);
            const { rating, reviewCount } =
                await this.productRatingService.getRating(product.id);

            productDetails.push({
                id: product.id.toString(),
                name: product.name,
                price: parseFloat(product.price.toString()),
                rating: rating,
                reviewCount: reviewCount,
                imageUrl: specifications['imageUrl'] || '',
                description: product.description || '',
                specifications: specifications || undefined,
                brand: specifications['manufacturer'] || '',
                sku: product.id || '',
                stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
                category: product.category || '',
            });
        }

        return productDetails;
    }

    // Delegate methods to specialized services
    async getAllBrands(): Promise<string[]> {
        return this.productSpecService.getAllBrands();
    }

    async getAllCategories(): Promise<string[]> {
        return this.productQueryService.getAllCategories();
    }

    async getSubcategoryValues(
        category: string,
        subcategory: string,
    ): Promise<string[]> {
        return this.productSpecService.getSubcategoryValues(
            category,
            subcategory,
        );
    }

    async getLandingPageProducts(): Promise<ProductDetailsDto[]> {
        const products =
            await this.productQueryService.getLandingPageProducts();
        return this.enrichProductsWithDetails(products);
    }

    async findAllProductsForAdmin(
        page: number = 1,
        limit: number = 12,
        sortBy: string = 'createdAt',
        sortOrder: 'ASC' | 'DESC' = 'DESC',
    ): Promise<{
        products: ProductDetailsDto[];
        total: number;
        pages: number;
        page: number;
    }> {
        const result = await this.productQueryService.findAllProductsForAdmin(
            page,
            limit,
            sortBy,
            sortOrder,
        );

        const productDetails = await this.enrichProductsWithDetails(
            result.products,
        );

        return {
            products: productDetails,
            total: result.total,
            pages: result.pages,
            page: result.page,
        };
    }

    async searchByName(
        query: string,
        page: number = 1,
        limit: number = 12,
        brands?: string[],
        minPrice?: number,
        maxPrice?: number,
        minRating?: number,
    ): Promise<{
        products: ProductDetailsDto[];
        total: number;
        pages: number;
        page: number;
    }> {
        try {
            if (!query || query.trim() === '') {
                return { products: [], total: 0, pages: 0, page };
            }

            // Try special pattern matching first (RTX 3050, etc)
            const enhancedSearchResults = await this.handleEnhancedSearch(
                query,
                page,
                limit,
            );
            if (enhancedSearchResults) {
                return enhancedSearchResults;
            }

            // Fall back to Elasticsearch for general searches
            const esResults = await this.productElasticsearchService.search(
                query,
                {
                    page,
                    limit,
                    minPrice,
                    maxPrice,
                    brands,
                },
            );

            if (esResults.total > 0) {
                // Get product IDs from Elasticsearch results
                const productIds = esResults.hits.map((hit) => hit.id);

                // Fetch full products from database
                const whereClause = { id: In(productIds) };

                // If minRating is provided, apply as additional filter
                if (minRating !== undefined && minRating > 0) {
                    const ratingFilteredIds =
                        await this.productRatingService.getProductIdsByMinRating(
                            minRating,
                        );

                    if (ratingFilteredIds.length === 0) {
                        return { products: [], total: 0, pages: 0, page };
                    }

                    // Only include products that meet rating threshold
                    whereClause.id = In(
                        productIds.filter((id) =>
                            ratingFilteredIds.includes(id),
                        ),
                    );
                }

                // Get products from DB in the same order as Elasticsearch results
                const products = await this.productRepository.find({
                    where: whereClause,
                });

                // Sort products in the same order as Elasticsearch results
                const sortedProducts = productIds
                    .map((id) => products.find((product) => product.id === id))
                    .filter(Boolean);

                // Enrich with details
                const productDetails =
                    await this.enrichProductsWithDetails(sortedProducts);

                return {
                    products: productDetails,
                    total: esResults.total,
                    pages: Math.ceil(esResults.total / limit),
                    page,
                };
            }

            // No results from Elasticsearch, fall back to database search
            return await this.legacySearchByName(
                query,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
            );
        } catch (error) {
            this.logger.error(
                `Error searching products by name: ${error.message}`,
            );
            // Fall back to legacy search if Elasticsearch fails
            return await this.legacySearchByName(
                query,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
            );
        }
    }

    // Legacy search method using database directly
    private async legacySearchByName(
        query: string,
        page: number = 1,
        limit: number = 12,
        brands?: string[],
        minPrice?: number,
        maxPrice?: number,
        minRating?: number,
    ): Promise<{
        products: ProductDetailsDto[];
        total: number;
        pages: number;
        page: number;
    }> {
        try {
            // Build standard filters
            const whereClause: any = {};

            // Add price filtering if provided
            if (minPrice !== undefined) {
                whereClause.price_gte = minPrice;
            }

            if (maxPrice !== undefined) {
                whereClause.price_lte = maxPrice;
            }

            // Handle brand filters if provided
            if (brands && brands.length > 0) {
                const brandFilteredIds =
                    await this.productSpecService.getProductIdsByBrands(brands);

                if (brandFilteredIds.length === 0) {
                    return { products: [], total: 0, pages: 0, page };
                }

                // If we also have rating filter, ensure products match both criteria
                if (minRating !== undefined && minRating > 0) {
                    const ratingFilteredIds =
                        await this.productRatingService.getProductIdsByMinRating(
                            minRating,
                        );

                    if (ratingFilteredIds.length === 0) {
                        return { products: [], total: 0, pages: 0, page };
                    }

                    whereClause.id_in = brandFilteredIds.filter((id) =>
                        ratingFilteredIds.includes(id),
                    );
                } else {
                    whereClause.id_in = brandFilteredIds;
                }
            }
            // If only rating filter is provided
            else if (minRating !== undefined && minRating > 0) {
                const ratingFilteredIds =
                    await this.productRatingService.getProductIdsByMinRating(
                        minRating,
                    );

                if (ratingFilteredIds.length === 0) {
                    return { products: [], total: 0, pages: 0, page };
                }

                whereClause.id_in = ratingFilteredIds;
            }

            // Query for products with filters
            const result = await this.productQueryService.searchByName(
                query,
                page,
                limit,
                whereClause,
            );

            // Enrich products with details
            const productDetails = await this.enrichProductsWithDetails(
                result.products,
            );

            return {
                products: productDetails,
                total: result.total,
                pages: result.pages,
                page: result.page,
            };
        } catch (error) {
            this.logger.error(`Error in legacy search: ${error.message}`);
            throw new Error('Failed to search products by name');
        }
    }

    // Add a new method to get search suggestions
    async getSearchSuggestions(query: string): Promise<string[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        try {
            return await this.productElasticsearchService.getSuggestions(
                query.trim(),
            );
        } catch (error) {
            this.logger.error(
                `Error getting search suggestions: ${error.message}`,
            );
            return [];
        }
    }

    // Method to manually trigger reindexing (useful for admin panel)
    async reindexProducts(): Promise<void> {
        return this.productElasticsearchService.reindexAllProducts();
    }

    /**
     * Handle enhanced search with product-specific terms
     * This recognizes special search patterns like GPU models, CPU models, etc.
     */
    private async handleEnhancedSearch(
        query: string,
        page: number,
        limit: number,
    ): Promise<{
        products: ProductDetailsDto[];
        total: number;
        pages: number;
        page: number;
    } | null> {
        try {
            // Normalize query to lowercase for case-insensitive matching
            const normalizedQuery = query.toLowerCase();
            this.logger.debug(`Enhanced search for query: ${normalizedQuery}`);

            // GPU specific search patterns
            const gpuRegex = /\b(rtx|gtx|rx)\s*(\d{4})\b/i;
            const gpuMatch = normalizedQuery.match(gpuRegex);

            if (gpuMatch) {
                this.logger.debug(
                    `GPU match found: ${JSON.stringify(gpuMatch)}`,
                );
                const gpuSeries = gpuMatch[1].toUpperCase(); // RTX, GTX, RX
                const gpuModel = gpuMatch[2]; // Model number (e.g., 3050, 4070)

                // We'll search for both patterns in chipset:
                // 1. The exact model number (3050)
                // 2. The series and model together (RTX 3050)
                const searchPattern = `${gpuSeries}.*${gpuModel}`;
                this.logger.debug(
                    `Searching for GPU pattern: ${searchPattern}`,
                );

                try {
                    // Get product IDs from Neo4j that match this chipset
                    const matchingIds =
                        await this.productSpecService.getProductIdsBySubcategoryFilters(
                            'GraphicsCard',
                            { chipset: [searchPattern] },
                            undefined,
                            true, // Enable pattern matching
                        );

                    this.logger.debug(
                        `Found ${matchingIds.length} matching GPU IDs`,
                    );

                    if (matchingIds && matchingIds.length > 0) {
                        // Use these IDs to fetch products from relational DB
                        const whereClause = { id: In(matchingIds) };
                        const result =
                            await this.productQueryService.findByCategory(
                                'GraphicsCard',
                                page,
                                limit,
                                whereClause,
                            );

                        // Enrich products with details
                        const productDetails =
                            await this.enrichProductsWithDetails(
                                result.products,
                            );

                        return {
                            products: productDetails,
                            total: result.total,
                            pages: result.pages,
                            page: result.page,
                        };
                    }
                } catch (gpuError) {
                    this.logger.error(
                        `Error in GPU enhanced search: ${gpuError.message}`,
                    );
                }
            }

            // CPU specific search patterns
            const cpuRegex =
                /\b(ryzen|core)\s*(\d)\s*(\d{4}|[a-zA-Z]\d{3,4})\b/i;
            const cpuMatch = normalizedQuery.match(cpuRegex);

            if (cpuMatch) {
                this.logger.debug(
                    `CPU match found: ${JSON.stringify(cpuMatch)}`,
                );

                try {
                    const cpuBrand =
                        cpuMatch[1].toLowerCase() === 'ryzen' ? 'AMD' : 'Intel';
                    let searchPattern = '';

                    if (cpuMatch[1].toLowerCase() === 'ryzen') {
                        // For Ryzen (example: "Ryzen 7 5800X")
                        searchPattern = `${cpuMatch[1]}.*${cpuMatch[2]}.*${cpuMatch[3]}`;
                    } else {
                        // For Intel Core (example: "Core i7 12700K")
                        searchPattern = `${cpuMatch[1]}.*${cpuMatch[2]}.*${cpuMatch[3]}`;
                    }

                    this.logger.debug(
                        `Searching for CPU pattern: ${searchPattern}`,
                    );

                    // Get product IDs from Neo4j that match this CPU model
                    const matchingIds =
                        await this.productSpecService.getProductIdsBySubcategoryFilters(
                            'CPU',
                            {
                                manufacturer: [cpuBrand],
                                series: [searchPattern],
                            },
                            undefined,
                            true, // Enable pattern matching
                        );

                    this.logger.debug(
                        `Found ${matchingIds.length} matching CPU IDs`,
                    );

                    if (matchingIds && matchingIds.length > 0) {
                        // Use these IDs to fetch products from relational DB
                        const whereClause = { id: In(matchingIds) };
                        const result =
                            await this.productQueryService.findByCategory(
                                'CPU',
                                page,
                                limit,
                                whereClause,
                            );

                        // Enrich products with details
                        const productDetails =
                            await this.enrichProductsWithDetails(
                                result.products,
                            );

                        return {
                            products: productDetails,
                            total: result.total,
                            pages: result.pages,
                            page: result.page,
                        };
                    }
                } catch (cpuError) {
                    this.logger.error(
                        `Error in CPU enhanced search: ${cpuError.message}`,
                    );
                }
            }

            // No special pattern matched or no results found
            this.logger.debug(
                'No specific hardware pattern matched in enhanced search',
            );
            return null; // Fall back to standard search
        } catch (error) {
            this.logger.error(`Error in enhanced search: ${error.message}`);
            return null; // Fall back to standard search on error
        }
    }
}
