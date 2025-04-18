import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UserBehavior } from '../../events/entities/user-behavior.entity';
import { Product } from '../product.entity';
import { ProductDetailsDto } from '../dto/product-response.dto';
import { ProductService } from '../product.service';
import { ConfigService } from '@nestjs/config';
import { HotSalesService } from '../services/hot-sales.service';

@Injectable()
export class RecommendationService {
    private readonly logger = new Logger(RecommendationService.name);
    private readonly mlApiUrl: string;

    constructor(
        @InjectRepository(UserBehavior)
        private userBehaviorRepository: Repository<UserBehavior>,
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
        private readonly productService: ProductService,
        private readonly configService: ConfigService,
        private readonly hotSalesService: HotSalesService,
    ) {
        this.mlApiUrl =
            this.configService.get<string>('ML_API_URL') ||
            'http://0.0.0.0:8003';
    }

    /**
     * Get personalized recommendations for a user
     * @param customerId Optional customer ID for personalized recommendations
     * @param sessionId Optional session ID for personalized recommendations
     * @param productId Current product ID to exclude from recommendations
     * @param category Product category for similar recommendations
     * @param limit Number of recommendations to return
     */
    async getRecommendedProducts(
        customerId?: number,
        sessionId?: string,
        productId?: string,
        category?: string,
        limit: number = 4,
    ): Promise<ProductDetailsDto[]> {
        try {
            let recommendedProductIds: string[] = [];

            // Priority logic:
            // 1. If productId is provided, prioritize product-based recommendations (for product detail pages)
            // 2. If only customerId/sessionId (no productId), use advanced recommendations (for homepage)
            // 3. Fall back to other methods as needed

            // Case 1: Product detail page - use product-based recommendations first
            if (productId) {
                try {
                    const mlRecommendations = await this.getMlRecommendations(
                        productId,
                        category,
                        limit,
                    );

                    if (mlRecommendations.length > 0) {
                        recommendedProductIds = mlRecommendations;

                        // If we have enough ML recommendations, return them directly
                        if (recommendedProductIds.length >= limit) {
                            return await this.fetchProductDetails(
                                recommendedProductIds.slice(0, limit),
                            );
                        }
                    }
                } catch (error) {
                    this.logger.warn(
                        `Error getting ML recommendations: ${error.message}. Falling back to standard recommendations.`,
                    );
                    // Continue with standard recommendations
                }
            }
            // Case 2: Homepage or non-product specific page - use advanced personalized recommendations
            else if (customerId || sessionId) {
                try {
                    const advancedRecommendations =
                        await this.getAdvancedMlRecommendations(
                            customerId,
                            sessionId,
                            category,
                            limit,
                        );

                    if (advancedRecommendations.length > 0) {
                        recommendedProductIds = advancedRecommendations;

                        // If we have enough ML recommendations, return them directly
                        if (recommendedProductIds.length >= limit) {
                            return await this.fetchProductDetails(
                                recommendedProductIds.slice(0, limit),
                            );
                        }
                    }
                } catch (error) {
                    this.logger.warn(
                        `Error getting advanced ML recommendations: ${error.message}. Falling back to standard recommendations.`,
                    );
                    // Continue with standard recommendations
                }
            }

            // If we still don't have enough recommendations, use existing methods
            // If we have a customer ID, get personalized recommendations
            if (customerId && recommendedProductIds.length < limit) {
                const personalizedRecommendations =
                    await this.getPersonalizedRecommendationsByCustomerId(
                        customerId,
                        productId,
                        limit - recommendedProductIds.length,
                    );

                // Add non-duplicate recommendations
                personalizedRecommendations.forEach((id) => {
                    if (!recommendedProductIds.includes(id)) {
                        recommendedProductIds.push(id);
                    }
                });
            } else if (sessionId && recommendedProductIds.length < limit) {
                // Get recommendations based on session behavior
                const sessionRecommendations =
                    await this.getPersonalizedRecommendationsBySessionId(
                        sessionId,
                        productId,
                        limit - recommendedProductIds.length,
                    );

                // Add non-duplicate recommendations
                sessionRecommendations.forEach((id) => {
                    if (!recommendedProductIds.includes(id)) {
                        recommendedProductIds.push(id);
                    }
                });
            }

            // If we don't have enough recommendations, add similar products by category
            if (recommendedProductIds.length < limit && category && productId) {
                const similarProductIds =
                    await this.getSimilarProductsByCategory(
                        category,
                        productId,
                        limit - recommendedProductIds.length,
                    );

                // Add non-duplicate similar products
                similarProductIds.forEach((id) => {
                    if (!recommendedProductIds.includes(id)) {
                        recommendedProductIds.push(id);
                    }
                });
            }

            // If we still don't have enough, get popular products
            if (recommendedProductIds.length < limit) {
                const popularProductIds = await this.getPopularProducts(
                    limit - recommendedProductIds.length,
                    [productId, ...recommendedProductIds].filter(Boolean),
                );

                // Add non-duplicate popular products
                popularProductIds.forEach((id) => {
                    if (!recommendedProductIds.includes(id)) {
                        recommendedProductIds.push(id);
                    }
                });
            }

            // Get full product details
            const products = await this.fetchProductDetails(
                recommendedProductIds,
            );
            return products;
        } catch (error) {
            this.logger.error(
                `Error getting recommended products: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get ML-based recommendations from the Python service
     */
    private async getMlRecommendations(
        productId: string,
        category?: string,
        limit: number = 4,
    ): Promise<string[]> {
        try {
            // Construct the API URL with query parameters
            let url = `${this.mlApiUrl}/api/recommendations?productId=${productId}`;

            if (category) {
                url += `&category=${encodeURIComponent(category)}`;
            }

            if (limit) {
                url += `&limit=${limit}`;
            }

            // Make the request to the ML API
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`ML API returned status ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(
                    data.message || 'ML API returned unsuccessful response',
                );
            }

            return data.recommendations || [];
        } catch (error) {
            this.logger.error(
                `Error fetching ML recommendations: ${error.message}`,
            );
            // Return empty array to trigger fallback to standard recommendations
            return [];
        }
    }

    /**
     * Get personalized recommendations based on customer behavior
     */
    private async getPersonalizedRecommendationsByCustomerId(
        customerId: number,
        currentProductId?: string,
        limit: number = 4,
    ): Promise<string[]> {
        try {
            // First, get the customer's viewed products and add to cart items
            const customerEvents = await this.userBehaviorRepository.find({
                where: {
                    customerId,
                    eventType: In([
                        'product_viewed',
                        'product_click',
                        'product_added_to_cart',
                    ]),
                },
                order: {
                    createdAt: 'DESC',
                },
                take: 30, // Look at recent activity
            });

            // Collect unique product IDs the customer has interacted with
            const interactedProductIds = new Set<string>();

            // Track viewed products by category to find similar products
            const categoryInterests = new Map<string, number>();

            customerEvents.forEach((event) => {
                if (event.entityId && event.entityId !== currentProductId) {
                    interactedProductIds.add(event.entityId);

                    // Track category interests for this user
                    const category = event.eventData?.category;
                    if (category) {
                        categoryInterests.set(
                            category,
                            (categoryInterests.get(category) || 0) + 1,
                        );
                    }
                }
            });

            // Get top categories of interest
            const topCategories = Array.from(categoryInterests.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map((entry) => entry[0]);

            let recommendedProductIds: string[] = [];

            // Get products from the same categories the user is interested in
            if (topCategories.length > 0) {
                const query = this.productRepository
                    .createQueryBuilder('product')
                    .where('product.category IN (:...categories)', {
                        categories: topCategories,
                    })
                    .andWhere('product.status = :status', { status: 'active' })
                    .orderBy('RANDOM()')
                    .take(limit);

                if (currentProductId) {
                    query.andWhere('product.id != :productId', {
                        productId: currentProductId,
                    });
                }

                const products = await query.getMany();
                recommendedProductIds = products.map((p) => p.id);
            }

            // If we already have interacted products, prioritize the most recently viewed ones
            if (interactedProductIds.size > 0) {
                // Include some recent interactions first, sorted by recency
                const recentProductIds = Array.from(interactedProductIds).slice(
                    0,
                    Math.min(2, limit),
                );
                recommendedProductIds = [
                    ...recentProductIds,
                    ...recommendedProductIds.filter(
                        (id) => !recentProductIds.includes(id),
                    ),
                ].slice(0, limit);
            }

            return recommendedProductIds;
        } catch (error) {
            this.logger.error(
                `Error getting personalized recommendations by customer: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get personalized recommendations based on session behavior
     */
    private async getPersonalizedRecommendationsBySessionId(
        sessionId: string,
        currentProductId?: string,
        limit: number = 4,
    ): Promise<string[]> {
        try {
            // Get the session's viewed products and add to cart items
            const sessionEvents = await this.userBehaviorRepository.find({
                where: {
                    sessionId,
                    eventType: In([
                        'product_viewed',
                        'product_click',
                        'product_added_to_cart',
                    ]),
                },
                order: {
                    createdAt: 'DESC',
                },
                take: 20, // Look at recent activity
            });

            // Collect unique product IDs from the session
            const interactedProductIds = new Set<string>();

            // Track viewed products by category to find similar products
            const categoryInterests = new Map<string, number>();

            sessionEvents.forEach((event) => {
                if (event.entityId && event.entityId !== currentProductId) {
                    interactedProductIds.add(event.entityId);

                    // Track category interests for this session
                    const category = event.eventData?.category;
                    if (category) {
                        categoryInterests.set(
                            category,
                            (categoryInterests.get(category) || 0) + 1,
                        );
                    }
                }
            });

            // Get top categories of interest from this session
            const topCategories = Array.from(categoryInterests.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map((entry) => entry[0]);

            let recommendedProductIds: string[] = [];

            // Get products from the same categories the session has viewed
            if (topCategories.length > 0) {
                const query = this.productRepository
                    .createQueryBuilder('product')
                    .where('product.category IN (:...categories)', {
                        categories: topCategories,
                    })
                    .andWhere('product.status = :status', { status: 'active' })
                    .orderBy('RANDOM()')
                    .take(limit);

                if (currentProductId) {
                    query.andWhere('product.id != :productId', {
                        productId: currentProductId,
                    });
                }

                const products = await query.getMany();
                recommendedProductIds = products.map((p) => p.id);
            }

            // If we already have interacted products in this session, prioritize them
            if (interactedProductIds.size > 0) {
                // Include recent interactions first
                const recentProductIds = Array.from(interactedProductIds).slice(
                    0,
                    Math.min(2, limit),
                );
                recommendedProductIds = [
                    ...recentProductIds,
                    ...recommendedProductIds.filter(
                        (id) => !recentProductIds.includes(id),
                    ),
                ].slice(0, limit);
            }

            return recommendedProductIds;
        } catch (error) {
            this.logger.error(
                `Error getting personalized recommendations by session: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get similar products by category
     */
    private async getSimilarProductsByCategory(
        category: string,
        productId: string,
        limit: number = 4,
    ): Promise<string[]> {
        try {
            // Get current product to get its price range for better recommendations
            const currentProduct = await this.productRepository.findOne({
                where: { id: productId },
            });

            if (!currentProduct) {
                return [];
            }

            // Get products in the same category with similar price range
            const query = this.productRepository
                .createQueryBuilder('product')
                .where('product.category = :category', { category })
                .andWhere('product.id != :productId', { productId })
                .andWhere('product.status = :status', { status: 'active' });

            // Add price range filter (products within 30% of current product's price)
            const minPrice = currentProduct.price * 0.7;
            const maxPrice = currentProduct.price * 1.3;
            query.andWhere('product.price BETWEEN :minPrice AND :maxPrice', {
                minPrice,
                maxPrice,
            });

            // Get random products in this category within price range
            const products = await query
                .orderBy('RANDOM()')
                .take(limit)
                .getMany();

            return products.map((p) => p.id);
        } catch (error) {
            this.logger.error(
                `Error getting similar products by category: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get popular products based on view count
     */
    private async getPopularProducts(
        limit: number = 4,
        excludeIds: string[] = [],
    ): Promise<string[]> {
        try {
            // Get product view events from the last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Count product views
            const productViewCounts = await this.userBehaviorRepository
                .createQueryBuilder('behavior')
                .select('behavior.entityId', 'productId')
                .addSelect('COUNT(*)', 'view_count')
                .where('behavior.eventType = :eventType', {
                    eventType: 'product_viewed',
                })
                .andWhere('behavior.createdAt >= :date', {
                    date: thirtyDaysAgo,
                })
                .andWhere('behavior.entityId IS NOT NULL')
                .groupBy('behavior.entityId')
                .orderBy('view_count', 'DESC')
                .take(limit + excludeIds.length) // Get more than needed to account for excluded IDs
                .getRawMany();

            // Filter out excluded IDs
            const filteredProductIds = productViewCounts
                .filter((item) => !excludeIds.includes(item.productId))
                .map((item) => item.productId)
                .slice(0, limit);

            return filteredProductIds;
        } catch (error) {
            this.logger.error(
                `Error getting popular products: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get product details for recommendations
     */
    private async fetchProductDetails(
        productIds: string[],
    ): Promise<ProductDetailsDto[]> {
        if (!productIds.length) {
            return [];
        }

        try {
            return await this.productService.getProductsWithDiscounts(
                productIds,
            );
        } catch (error) {
            this.logger.error(
                `Error fetching product details: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get advanced ML-based recommendations from the Python service
     */
    private async getAdvancedMlRecommendations(
        customerId?: number,
        sessionId?: string,
        category?: string,
        limit: number = 4,
    ): Promise<string[]> {
        try {
            // Construct the API URL with query parameters
            let url = `${this.mlApiUrl}/api/advanced-recommendations?`;

            if (customerId) {
                url += `&customerId=${customerId}`;
            }

            if (sessionId) {
                url += `&sessionId=${encodeURIComponent(sessionId)}`;
            }

            if (category) {
                url += `&category=${encodeURIComponent(category)}`;
            }

            if (limit) {
                url += `&limit=${limit}`;
            }

            // Make the request to the ML API
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`ML API returned status ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(
                    data.message || 'ML API returned unsuccessful response',
                );
            }

            const recommendations = data.recommendations || [];

            // If we got recommendations, return them
            if (recommendations.length > 0) {
                return recommendations;
            }

            // If no recommendations were found, try to get hot sales products as fallback

            try {
                // Get product IDs from hot sales
                const hotSalesProductIds =
                    await this.hotSalesService.findAllProductIds();

                if (hotSalesProductIds && hotSalesProductIds.length > 0) {
                    return hotSalesProductIds.slice(0, limit);
                }
            } catch (hotSalesError) {
                this.logger.error(
                    `Error fetching hot sales as fallback: ${hotSalesError.message}`,
                );
            }

            // If all else fails, return empty array
            return [];
        } catch (error) {
            this.logger.error(
                `Error fetching advanced ML recommendations: ${error.message}`,
            );
            // Return empty array to trigger fallback to standard recommendations
            return [];
        }
    }

    /**
     * Get category-specific recommendations
     * @param category Product category to get recommendations for
     * @param limit Number of recommendations to return
     */
    async getCategoryRecommendations(
        category: string,
        limit: number = 10,
    ): Promise<ProductDetailsDto[]> {
        try {
            // First try to find popular products in this category based on user behavior
            const popularProductIds = await this.getPopularProductsByCategory(
                category,
                limit,
            );

            if (popularProductIds.length > 0) {
                const products =
                    await this.fetchProductDetails(popularProductIds);
                return products;
            }

            // If no popular products found, get top-rated products in this category
            return await this.getTopRatedProductsByCategory(category, limit);
        } catch (error) {
            this.logger.error(
                `Error getting category recommendations: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get popular products in a specific category based on user behavior
     */
    private async getPopularProductsByCategory(
        category: string,
        limit: number = 10,
    ): Promise<string[]> {
        try {
            // Get recent product view events for this category
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Get product views in this category
            const productViewCountsQuery = this.userBehaviorRepository
                .createQueryBuilder('behavior')
                .innerJoin(
                    'Products',
                    'product',
                    'behavior.entity_id::uuid = product.id',
                )
                .select('behavior.entity_id', 'productId')
                .addSelect('COUNT(*)', 'view_count')
                .where('behavior.eventType IN (:...eventTypes)', {
                    eventTypes: [
                        'product_viewed',
                        'product_click',
                        'product_added_to_cart',
                    ],
                })
                .andWhere('behavior.createdAt >= :date', {
                    date: thirtyDaysAgo,
                })
                .andWhere('behavior.entity_id IS NOT NULL')
                .andWhere('product.category = :category', { category })
                .andWhere('product.status = :status', { status: 'active' })
                .groupBy('behavior.entity_id')
                .orderBy('view_count', 'DESC')
                .take(limit);

            const productViewCounts = await productViewCountsQuery.getRawMany();

            if (productViewCounts.length > 0) {
                return productViewCounts.map((item) => item.productId);
            }

            return [];
        } catch (error) {
            this.logger.error(
                `Error getting popular products by category: ${error.message}`,
            );
            return [];
        }
    }

    /**
     * Get top-rated products in a specific category
     */
    private async getTopRatedProductsByCategory(
        category: string,
        limit: number = 10,
    ): Promise<ProductDetailsDto[]> {
        try {
            // Products don't have a direct rating column, so we'll join with Rating_Comment and get average ratings
            // First get all products in this category
            const query = this.productRepository
                .createQueryBuilder('product')
                .leftJoin(
                    'Rating_Comment',
                    'rating',
                    'product.id = rating.product_id',
                )
                .select('product.id', 'productId')
                .addSelect('AVG(COALESCE(rating.stars, 0))', 'averageRating')
                .where('product.category = :category', { category })
                .andWhere('product.status = :status', { status: 'active' })
                .groupBy('product.id')
                .orderBy('"averageRating"', 'DESC')
                .addOrderBy('RANDOM()')
                .take(limit);

            const ratedProducts = await query.getRawMany();

            if (!ratedProducts || ratedProducts.length === 0) {
                // If no ratings, just get any products in this category
                const fallbackQuery = this.productRepository
                    .createQueryBuilder('product')
                    .select('product.id')
                    .where('product.category = :category', { category })
                    .andWhere('product.status = :status', { status: 'active' })
                    .orderBy('RANDOM()')
                    .take(limit);

                const products = await fallbackQuery.getMany();

                if (!products || products.length === 0) {
                    return [];
                }

                // Convert to ProductDetailsDto format with discounts
                return await this.productService.getProductsWithDiscounts(
                    products.map((p) => p.id),
                );
            }

            // Convert to ProductDetailsDto format with discounts
            return await this.productService.getProductsWithDiscounts(
                ratedProducts.map((p) => p.productId),
            );
        } catch (error) {
            this.logger.error(
                `Error getting top-rated products by category: ${error.message}`,
            );
            // Fall back to getting any products in this category
            try {
                const fallbackQuery = this.productRepository
                    .createQueryBuilder('product')
                    .where('product.category = :category', { category })
                    .andWhere('product.status = :status', { status: 'active' })
                    .orderBy('RANDOM()')
                    .take(limit);

                const products = await fallbackQuery.getMany();

                if (!products || products.length === 0) {
                    return [];
                }

                return await this.productService.getProductsWithDiscounts(
                    products.map((p) => p.id),
                );
            } catch (fallbackError) {
                this.logger.error(
                    `Error getting fallback products by category: ${fallbackError.message}`,
                );
                return [];
            }
        }
    }

    /**
     * Get preferred categories for a customer based on their behavior
     * @param customerId Customer ID
     * @param sessionId Session ID
     * @param limit Maximum number of categories to return
     */
    async getPreferredCategories(
        customerId?: number,
        sessionId?: string,
        limit: number = 5,
    ): Promise<string[]> {
        try {
            const categoryScores = new Map<string, number>();

            // Case 1: If customerId is provided, check customer's behavior
            if (customerId) {
                // Get the customer's viewed products
                const viewedProductsQuery = `
                    SELECT p.category, COUNT(*) as count
                    FROM "Viewed_Products" vp
                    JOIN "Products" p ON vp.product_id = p.id
                    WHERE vp.customer_id = $1
                    GROUP BY p.category
                    ORDER BY count DESC
                `;

                const viewedResult = await this.productRepository.query(
                    viewedProductsQuery,
                    [customerId],
                );

                // Add viewed categories to scores
                viewedResult.forEach((row) => {
                    categoryScores.set(
                        row.category,
                        (categoryScores.get(row.category) || 0) + row.count * 2, // Weight views more
                    );
                });

                // Get the customer's behavior data (clicks, cart additions, etc.)
                const behaviorProductsQuery = `
                    SELECT p.category, COUNT(*) as count,
                        SUM(CASE
                            WHEN ub.event_type = 'product_added_to_cart' THEN 3
                            WHEN ub.event_type = 'product_viewed' THEN 1
                            WHEN ub.event_type = 'product_click' THEN 2
                            WHEN ub.event_type = 'order_created' THEN 4
                            WHEN ub.event_type = 'payment_completed' THEN 5
                            ELSE 1
                        END) as weighted_count
                    FROM "User_Behavior" ub
                    JOIN "Products" p ON ub.entity_id::uuid = p.id
                    WHERE ub.customer_id = $1
                      AND ub.entity_type = 'product'
                    GROUP BY p.category
                    ORDER BY weighted_count DESC
                `;

                const behaviorResult = await this.productRepository.query(
                    behaviorProductsQuery,
                    [customerId],
                );

                // Add behavior categories to scores
                behaviorResult.forEach((row) => {
                    categoryScores.set(
                        row.category,
                        (categoryScores.get(row.category) || 0) +
                            parseInt(row.weighted_count),
                    );
                });

                // Get the customer's order history (purchased products)
                const orderProductsQuery = `
                    SELECT p.category, COUNT(*) as count
                    FROM "Orders" o
                    JOIN "Order_Detail" od ON o.id = od.order_id
                    JOIN "Products" p ON od.product_id = p.id
                    WHERE o.customer_id = $1
                      AND o.status IN ('completed', 'delivered', 'processing')
                    GROUP BY p.category
                    ORDER BY count DESC
                `;

                const orderResult = await this.productRepository.query(
                    orderProductsQuery,
                    [customerId],
                );

                // Add purchased product categories with higher weight (6)
                orderResult.forEach((row) => {
                    categoryScores.set(
                        row.category,
                        (categoryScores.get(row.category) || 0) + row.count * 6, // Higher weight for actual purchases
                    );
                });

                // Also check for order and payment events in User_Behavior
                const orderEventsQuery = `
                    SELECT p.category, ub.event_type, COUNT(*) as count
                    FROM "User_Behavior" ub
                    JOIN "Orders" o ON ub.entity_id = o.id::text
                    JOIN "Order_Detail" od ON o.id = od.order_id
                    JOIN "Products" p ON od.product_id = p.id
                    WHERE ub.customer_id = $1
                      AND ub.entity_type IN ('order', 'payment')
                      AND ub.event_type IN ('order_created', 'payment_completed')
                    GROUP BY p.category, ub.event_type
                    ORDER BY count DESC
                `;

                const orderEventsResult = await this.productRepository.query(
                    orderEventsQuery,
                    [customerId],
                );

                // Add order events with high weights
                orderEventsResult.forEach((row) => {
                    const weight = row.event_type === 'order_created' ? 4 : 5; // 4 for order_created, 5 for payment_completed
                    categoryScores.set(
                        row.category,
                        (categoryScores.get(row.category) || 0) +
                            row.count * weight,
                    );
                });
            }

            // Case 2: If sessionId is provided, check session behavior
            if (sessionId && (!customerId || categoryScores.size < limit)) {
                const sessionBehaviorQuery = `
                    SELECT p.category, COUNT(*) as count,
                        SUM(CASE
                            WHEN ub.event_type = 'product_added_to_cart' THEN 3
                            WHEN ub.event_type = 'product_viewed' THEN 1
                            WHEN ub.event_type = 'product_click' THEN 2
                            WHEN ub.event_type = 'order_created' THEN 4
                            WHEN ub.event_type = 'payment_completed' THEN 5
                            ELSE 1
                        END) as weighted_count
                    FROM "User_Behavior" ub
                    JOIN "Products" p ON ub.entity_id::uuid = p.id
                    WHERE ub.session_id::text = $1
                      AND ub.entity_type = 'product'
                    GROUP BY p.category
                    ORDER BY weighted_count DESC
                `;

                const sessionResult = await this.productRepository.query(
                    sessionBehaviorQuery,
                    [sessionId],
                );

                // Add session categories to scores
                sessionResult.forEach((row) => {
                    categoryScores.set(
                        row.category,
                        (categoryScores.get(row.category) || 0) +
                            parseInt(row.weighted_count),
                    );
                });

                // Also check for order events in the session
                const sessionOrderEventsQuery = `
                    SELECT p.category, ub.event_type, COUNT(*) as count
                    FROM "User_Behavior" ub
                    JOIN "Orders" o ON ub.entity_id = o.id::text
                    JOIN "Order_Detail" od ON o.id = od.order_id
                    JOIN "Products" p ON od.product_id = p.id
                    WHERE ub.session_id::text = $1
                      AND ub.entity_type IN ('order', 'payment')
                      AND ub.event_type IN ('order_created', 'payment_completed')
                    GROUP BY p.category, ub.event_type
                    ORDER BY count DESC
                `;

                const sessionOrderEventsResult =
                    await this.productRepository.query(
                        sessionOrderEventsQuery,
                        [sessionId],
                    );

                // Add order events with high weights
                sessionOrderEventsResult.forEach((row) => {
                    const weight = row.event_type === 'order_created' ? 4 : 5; // 4 for order_created, 5 for payment_completed
                    categoryScores.set(
                        row.category,
                        (categoryScores.get(row.category) || 0) +
                            row.count * weight,
                    );
                });
            }

            // Case 3: If we still don't have enough categories, get the most popular ones
            if (categoryScores.size < limit) {
                const popularCategoriesQuery = `
                    SELECT p.category, COUNT(*) as count
                    FROM "Products" p
                    JOIN "User_Behavior" ub ON p.id = ub.entity_id::uuid
                    WHERE ub.entity_type = 'product'
                      AND ub.created_at > NOW() - INTERVAL '30 days'
                    GROUP BY p.category
                    ORDER BY count DESC
                    LIMIT $1
                `;

                const popularResult = await this.productRepository.query(
                    popularCategoriesQuery,
                    [limit],
                );

                // Add popular categories to scores, with lower weight
                popularResult.forEach((row) => {
                    if (!categoryScores.has(row.category)) {
                        categoryScores.set(
                            row.category,
                            parseInt(row.count) * 0.5,
                        );
                    }
                });
            }

            // Sort categories by score and return the top 'limit' categories
            const sortedCategories = Array.from(categoryScores.entries())
                .sort((a, b) => b[1] - a[1])
                .map((entry) => entry[0])
                .slice(0, limit);

            // If we still don't have enough, use default categories
            if (sortedCategories.length < 3) {
                const defaultCategories = [
                    'CPU',
                    'GraphicsCard',
                    'Motherboard',
                    'RAM',
                    'InternalHardDrive',
                ];

                defaultCategories.forEach((category) => {
                    if (!sortedCategories.includes(category)) {
                        sortedCategories.push(category);
                        if (sortedCategories.length >= limit) {
                            return;
                        }
                    }
                });
            }

            return sortedCategories.slice(0, limit);
        } catch (error) {
            this.logger.error(
                `Error getting preferred categories: ${error.message}`,
            );
            // Return default categories on error
            return ['CPU', 'GraphicsCard', 'Motherboard'];
        }
    }
}
