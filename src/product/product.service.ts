import { Injectable, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProductDetailsDto } from './dto/product-response.dto';
import { UtilsService } from 'service/utils.service';
import { ProductQueryService } from './services/product-query.service';
import { ProductSpecificationService } from './services/product-specification.service';
import { ProductRatingService } from './services/product-rating.service';
import { ProductElasticsearchService } from './services/product-elasticsearch.service';
import { DiscountService } from '../discount/discount.service';
import { Neo4jConfigService } from '../../config/neo4j.config';

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
        private readonly discountService: DiscountService,
        private readonly neo4jConfigService: Neo4jConfigService,
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
            let productDetails = {
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

            // Apply automatic discounts
            const productsWithDiscounts = await this.applyAutomaticDiscounts([productDetails]);

            return productsWithDiscounts[0];
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
            if (
                subcategoryFilters &&
                Object.keys(subcategoryFilters).length > 0
            ) {
                try {
                    const subcategoryFilteredIds =
                        await this.productSpecService.getProductIdsBySubcategoryFilters(
                            category,
                            subcategoryFilters,
                            brands,
                        );

                    if (
                        !subcategoryFilteredIds ||
                        subcategoryFilteredIds.length === 0
                    ) {
                        return { products: [], total: 0, pages: 0, page };
                    }

                    filteredProductIds = subcategoryFilteredIds;
                } catch (error) {
                    this.logger.error(
                        `Error applying subcategory filters: ${error.message}`,
                    );
                    throw error;
                }
            }
            // If no subcategory filters but we have brand filters, handle those
            else if (brands && brands.length > 0) {
                const brandFilteredIds =
                    await this.productSpecService.getProductIdsByBrands(
                        brands,
                        category,
                    );

                if (!brandFilteredIds || brandFilteredIds.length === 0) {
                    return { products: [], total: 0, pages: 0, page };
                }

                filteredProductIds = brandFilteredIds;
            }

            // Apply rating filter if provided
            if (minRating !== undefined && minRating > 0) {
                const ratingFilteredIds =
                    await this.productRatingService.getProductIdsByMinRating(
                        minRating,
                    );

                if (!ratingFilteredIds || ratingFilteredIds.length === 0) {
                    return { products: [], total: 0, pages: 0, page };
                }

                // If we already have product IDs from previous filters, we need to find the intersection
                if (filteredProductIds) {
                    filteredProductIds = filteredProductIds.filter((id) =>
                        ratingFilteredIds.includes(id),
                    );

                    if (filteredProductIds.length === 0) {
                        return { products: [], total: 0, pages: 0, page };
                    }
                } else {
                    filteredProductIds = ratingFilteredIds;
                }
            }

            // Query for products with filters
            const result = await this.productQueryService.findByCategory(
                category,
                page,
                limit,
                whereClause,
                filteredProductIds || undefined,
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
            this.logger.error(
                `Error finding products by category: ${error.message}`,
            );
            throw new Error(
                `Failed to find products by category: ${error.message}`,
            );
        }
    }

    // Helper to enrich products with Neo4j details and ratings
    // Optimized to avoid N+1 queries by using batch fetching
    private async enrichProductsWithDetails(
        products: Product[],
    ): Promise<ProductDetailsDto[]> {
        if (!products || products.length === 0) {
            return [];
        }
        
        try {
            // Get all product IDs for batch fetching
            const productIds = products.map(product => product.id);
            
            // Batch fetch specifications and ratings for all products at once
            const [specificationsMap, ratingsMap] = await Promise.all([
                this.productSpecService.getSpecificationsInBatch(productIds),
                this.productRatingService.getRatingsInBatch(productIds)
            ]);
            
            // Map each product to its enriched DTO
            const productDetails = products.map(product => {
                const id = product.id;
                const specifications = specificationsMap[id] || {};
                const { rating, reviewCount } = ratingsMap[id] || { rating: 0, reviewCount: 0 };
                
                return {
                    id: id.toString(),
                    name: product.name,
                    price: parseFloat(product.price.toString()),
                    originalPrice: product.originalPrice ? parseFloat(product.originalPrice.toString()) : undefined,
                    rating: rating,
                    reviewCount: reviewCount,
                    imageUrl: specifications['imageUrl'] || '',
                    description: product.description || '',
                    specifications: specifications as Record<string, any>, // Fix type compatibility issue
                    brand: specifications['manufacturer'] || '',
                    sku: id || '',
                    stock: product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng',
                    category: product.category || '',
                    stockQuantity: product.stockQuantity,
                };
            });
            
            // Use type assertion to ensure compatibility with ProductDetailsDto[]
            return this.applyAutomaticDiscounts(productDetails as ProductDetailsDto[]);
        } catch (error) {
            this.logger.error(`Error enriching products with details: ${error.message}`);
            throw error;
        }
    }

    // Optimize discount service to minimize API calls
    async applyAutomaticDiscounts(products: ProductDetailsDto[]): Promise<ProductDetailsDto[]> {
        if (!products || products.length === 0) {
            return products;
        }
        
        try {
            // Instead of making separate API calls per category, collect all data upfront
            
            // Extract all unique product IDs and categories
            const allProductIds = products.map(product => product.id);
            
            // Collect all unique categories (each product has exactly one category)
            const allCategories = Array.from(new Set(
                products.map(product => product.category).filter(Boolean)
            ));
            
            // Make a single API call to get all applicable discounts
            const allDiscounts = await this.discountService.getAutomaticDiscounts({
                productIds: allProductIds,
                categoryNames: allCategories,
                orderAmount: 0
            });
            
            // Process each product with the complete discount information
            return products.map(product => {
                // Find applicable discounts for this product
                const applicableDiscounts = allDiscounts.filter(discount => 
                    discount.targetType === 'all' || 
                    (discount.targetType === 'products' && discount.productIds?.includes(product.id)) ||
                    (discount.targetType === 'categories' && product.category && 
                     discount.categoryNames?.includes(product.category))
                );
                
                // If we have applicable discounts, find the best one and apply it
                if (applicableDiscounts.length > 0) {
                    const bestDiscount = this.findBestDiscount(applicableDiscounts, product.price);
                    
                    if (bestDiscount) {
                        // Apply discount logic
                        product.originalPrice = product.price;
                        
                        if (bestDiscount.type === 'percentage') {
                            product.discountPercentage = bestDiscount.discountAmount;
                            product.price = product.price * (1 - bestDiscount.discountAmount/100);
                        } else {
                            const discountAmount = Math.min(bestDiscount.discountAmount, product.price);
                            product.discountPercentage = Math.round((discountAmount / product.originalPrice) * 100);
                            product.price = product.price - discountAmount;
                        }
                        
                        product.price = Math.round(product.price);
                        product.isDiscounted = true;
                        product.discountSource = 'automatic';
                        product.discountType = bestDiscount.type;
                    }
                }
                
                return product;
            });
        } catch (error) {
            this.logger.error(`Error applying automatic discounts: ${error.message}`);
            return products;
        }
    }

    // Helper method to find the best discount for a product
    private findBestDiscount(discounts: any[], productPrice: number): any {
        if (!discounts || discounts.length === 0) {
            return null;
        }
        
        // Calculate actual discount amounts
        const discountsWithValues = discounts.map(discount => {
            let discountValue = 0;
            
            if (discount.type === 'percentage') {
                discountValue = productPrice * (discount.discountAmount / 100);
            } else {
                discountValue = Math.min(discount.discountAmount, productPrice);
            }
            
            return {
                ...discount,
                calculatedValue: discountValue
            };
        });
        
        // Sort by discount value descending
        discountsWithValues.sort((a, b) => b.calculatedValue - a.calculatedValue);
        
        // Return the discount with highest value
        return discountsWithValues[0];
    }

    /**
     * Get multiple products by IDs with discounts pre-calculated
     * Optimized to avoid N+1 queries
     */
    async getProductsWithDiscounts(productIds: string[]): Promise<ProductDetailsDto[]> {
        try {
            if (!productIds || productIds.length === 0) {
                return [];
            }

            // Use ProductQueryService to get basic product data
            const products = await this.productQueryService.getProductsWithDiscounts(productIds);
            
            // Batch fetch additional data
            const idsNeedingImages = products
                .filter(product => !product.imageUrl)
                .map(product => product.id);
            const idsNeedingRatings = products
                .filter(product => product.rating === 0)
                .map(product => product.id);
            
            // Batch fetch specifications and ratings
            const [specificationsMap, ratingsMap] = await Promise.all([
                idsNeedingImages.length > 0 
                    ? this.productSpecService.getSpecificationsInBatch(idsNeedingImages)
                    : {},
                idsNeedingRatings.length > 0
                    ? this.productRatingService.getRatingsInBatch(idsNeedingRatings)
                    : {}
            ]);
            
            // Enrich products with the fetched data
            const enrichedProducts = products.map(product => {
                // Add specifications data if needed
                if (!product.imageUrl && specificationsMap[product.id]) {
                    const specs = specificationsMap[product.id];
                    product.imageUrl = specs['imageUrl'] || '';
                    product.brand = specs['manufacturer'] || '';
                }
                
                // Add ratings data if needed
                if (product.rating === 0 && ratingsMap[product.id]) {
                    const ratingData = ratingsMap[product.id];
                    product.rating = ratingData.rating;
                    product.reviewCount = ratingData.reviewCount;
                }
                
                return product;
            });

            // Apply automatic discounts before returning
            return this.applyAutomaticDiscounts(enrichedProducts);
            
        } catch (error) {
            this.logger.error(`Error getting products with discounts: ${error.message}`);
            throw new Error(`Failed to get products with discounts: ${error.message}`);
        }
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

            // GPU specific search patterns
            const gpuRegex = /\b(rtx|gtx|rx)\s*(\d{4})\b/i;
            const gpuMatch = normalizedQuery.match(gpuRegex);

            if (gpuMatch) {
                const gpuSeries = gpuMatch[1].toUpperCase(); // RTX, GTX, RX
                const gpuModel = gpuMatch[2]; // Model number (e.g., 3050, 4070)

                // We'll search for both patterns in chipset:
                // 1. The exact model number (3050)
                // 2. The series and model together (RTX 3050)
                const searchPattern = `${gpuSeries}.*${gpuModel}`;

                try {
                    // Get product IDs from Neo4j that match this chipset
                    const matchingIds =
                        await this.productSpecService.getProductIdsBySubcategoryFilters(
                            'GraphicsCard',
                            { chipset: [searchPattern] },
                            undefined,
                            true, // Enable pattern matching
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
            return null; // Fall back to standard search
        } catch (error) {
            this.logger.error(`Error in enhanced search: ${error.message}`);
            return null; // Fall back to standard search on error
        }
    }

    /**
     * Get stock quantities for multiple products
     * @param ids Array of product IDs or comma-separated string of IDs
     * @returns Object mapping product IDs to their stock quantities
     */
    async getStockQuantities(ids: string[] | string): Promise<Record<string, number>> {
        try {
            // Handle both array and comma-separated string formats
            let productIds: string[];
            if (typeof ids === 'string') {
                productIds = ids.split(',').map(id => id.trim());
            } else {
                productIds = ids;
            }
   
            // Remove any duplicates
            const uniqueIds = [...new Set(productIds)].filter(id => id);
            
            if (uniqueIds.length === 0) {
                return {};
            }
            
            // Find products with these IDs
            const products = await this.productRepository.find({
                where: { id: In(uniqueIds) },
                select: ['id', 'stockQuantity']
            });
            
            // Create a mapping of id -> stock_quantity
            return products.reduce((stocks, product) => {
                stocks[product.id] = product.stockQuantity;
                return stocks;
            }, {} as Record<string, number>);
        } catch (error) {
            this.logger.error(`Error getting stock quantities: ${error.message}`);
            return {};
        }
    }

    async getSimpleProductList(
        search?: string,
        page: number = 1,
        limit: number = 10
    ): Promise<{ products: { id: string, name: string }[], total: number, pages: number }> {
        try {
            const queryBuilder = this.productRepository.createQueryBuilder('product')
                .select(['product.id', 'product.name'])
                .where('product.status = :status', { status: 'active' });
            
            // Add search condition if search term is provided
            if (search && search.trim() !== '') {
                queryBuilder.andWhere('LOWER(product.name) LIKE LOWER(:search)', { 
                    search: `%${search.trim()}%` 
                });
            }
            
            // Get total count for pagination
            const total = await queryBuilder.getCount();
            
            // Add pagination
            const products = await queryBuilder
                .orderBy('product.name', 'ASC')
                .skip((page - 1) * limit)
                .take(limit)
                .getMany();
                
            // Calculate total pages
            const pages = Math.ceil(total / limit);
            
            return {
                products,
                total,
                pages
            };
        } catch (error) {
            this.logger.error(`Failed to get simple product list: ${error.message}`);
            throw new InternalServerErrorException('Failed to retrieve product list');
        }
    }

    // /**
    //  * Migrate image URLs from Neo4j to PostgreSQL
    //  */
    // async migrateImagesFromNeo4j(): Promise<{ migratedCount: number }> {
    //     const logger = new Logger('migrateImagesFromNeo4j');
    //     logger.log('Starting image URL migration from Neo4j to PostgreSQL');
        
    //     try {
    //         // Get all products from PostgreSQL
    //         const products = await this.productRepository.find();
    //         logger.log(`Found ${products.length} products in PostgreSQL`);
            
    //         let migratedCount = 0;
    //         let errorCount = 0;
            
    //         // Get Neo4j driver from config service
    //         const driver = this.neo4jConfigService.getDriver();
    //         const session = driver.session();
            
    //         try {
    //             // Process each product
    //             for (const product of products) {
    //                 try {
    //                     // Query Neo4j for the product's image URL
    //                     const result = await session.run(
    //                         'MATCH (p {id: $id}) RETURN p.imageUrl as imageUrl',
    //                         { id: product.id }
    //                     );
                        
    //                     const imageUrl = result.records[0]?.get('imageUrl');
                        
    //                     if (imageUrl) {
    //                         // Update the PostgreSQL product with the image URL
    //                         product.imageUrl = imageUrl;
    //                         await this.productRepository.save(product);
    //                         migratedCount++;
                            
    //                         if (migratedCount % 50 === 0) {
    //                             logger.log(`Migrated ${migratedCount} products so far`);
    //                         }
    //                     }
    //                 } catch (err) {
    //                     errorCount++;
    //                     logger.error(`Error migrating product ${product.id}: ${err.message}`);
    //                     // Continue with the next product
    //                 }
    //             }
    //         } finally {
    //             // Close the session when done
    //             await session.close();
    //         }
            
    //         logger.log(`Migration completed. Migrated: ${migratedCount}, Errors: ${errorCount}`);
    //         return { migratedCount };
    //     } catch (error) {
    //         logger.error(`Migration failed: ${error.message}`);
    //         throw new Error(`Failed to migrate image URLs: ${error.message}`);
    //     }
    // }
}
