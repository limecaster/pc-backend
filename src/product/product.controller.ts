import {
    Controller,
    Get,
    Param,
    NotFoundException,
    Post,
    Query,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    UseGuards,
    InternalServerErrorException,
    Logger,
    HttpException,
    HttpStatus,
    Body,
    Delete,
    Put,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductDetailsDto } from './dto/product-response.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryConfigService } from '../../config/cloudinary.config';
import { Express } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { HotSalesService } from './services/hot-sales.service';
import { RecommendationService } from './services/recommendation.service';
import { ConfigService } from '@nestjs/config';

interface PaginatedProductsResponse {
    products: ProductDetailsDto[];
    total: number;
    pages: number;
    page: number;
}

@Controller('products')
export class ProductController {
    private readonly logger = new Logger(ProductController.name);

    constructor(
        private readonly productService: ProductService,
        private readonly cloudinaryService: CloudinaryConfigService,
        private readonly hotSalesService: HotSalesService,
        private readonly recommendationService: RecommendationService,
        private readonly configService: ConfigService,
    ) {}

    @Post('admin/train-recommendation-model')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async trainRecommendationModel(): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const mlApiUrl =
                this.configService.get<string>('ML_API_URL') ||
                'http://127.0.0.1:3003';

            // Call the ML API to train both standard and advanced models
            const response = await fetch(
                `${mlApiUrl}/api/recommendations/train`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to train recommendation models: ${response.status} ${errorText}`,
                );
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(
                    result.message || 'ML API returned unsuccessful response',
                );
            }

            // Get the health status of the models
            const healthResponse = await fetch(
                `${mlApiUrl}/api/recommendations/health`,
            );
            let healthInfo = '';

            if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                healthInfo = ` Standard model: ${healthData.standard_model_status}. Advanced model: ${healthData.advanced_model_status}. Product count: ${healthData.product_count}.`;
            }

            return {
                success: true,
                message:
                    'Recommendation models training started successfully.' +
                    healthInfo,
            };
        } catch (error) {
            this.logger.error(
                `Error training recommendation models: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to train recommendation models',
            );
        }
    }

    @Get('admin/simple-list')
    async getSimpleProductList(
        @Query('search') search?: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ): Promise<{
        products: { id: string; name: string }[];
        total: number;
        pages: number;
    }> {
        try {
            return await this.productService.getSimpleProductList(
                search,
                page,
                limit,
            );
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to retrieve product list',
            );
        }
    }

    @Get('stock')
    async getProductsStockQuantities(@Query('ids') ids: string) {
        try {
            if (!ids) {
                return { success: true, stocks: {} };
            }

            const productIds = ids.split(',').filter((id) => id);

            if (productIds.length === 0) {
                return { success: true, stocks: {} };
            }

            const stocks =
                await this.productService.getStockQuantities(productIds);
            return {
                success: true,
                stocks,
            };
        } catch (error) {
            throw new HttpException(
                `Failed to get product stock quantities: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('brands')
    async getAllBrands(): Promise<string[]> {
        try {
            return await this.productService.getAllBrands();
        } catch (error) {
            throw new InternalServerErrorException('Failed to retrieve brands');
        }
    }

    @Get('all')
    async getAllProducts(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 12,
        @Query('brands') brandsParam?: string,
        @Query('minPrice') minPrice?: number,
        @Query('maxPrice') maxPrice?: number,
        @Query('minRating') minRating?: number,
    ): Promise<PaginatedProductsResponse> {
        try {
            const brands = brandsParam ? brandsParam.split(',') : undefined;
            const result = await this.productService.findByCategory(
                undefined,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
            );

            if (result.products && Array.isArray(result.products)) {
                result.products = result.products.map((product) =>
                    this.ensureProductInfo(product),
                );
            }

            return result;
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to retrieve all products',
            );
        }
    }

    @Get('admin/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async getAllProductsForAdmin(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 12,
        @Query('sortBy') sortBy: string = 'createdAt',
        @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
    ): Promise<PaginatedProductsResponse> {
        try {
            return await this.productService.findAllProductsForAdmin(
                page,
                limit,
                sortBy,
                sortOrder,
            );
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to retrieve products for admin',
            );
        }
    }

    @Get('admin/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async getProductByIdForAdmin(
        @Param('id') id: string,
    ): Promise<ProductDetailsDto> {
        try {
            return await this.productService.findBySlug(id, true);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Failed to retrieve product for admin',
            );
        }
    }

    @Get('category/:category')
    async findByCategory(
        @Param('category') category: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 12,
        @Query('brands') brandsParam?: string,
        @Query('minPrice') minPrice?: number,
        @Query('maxPrice') maxPrice?: number,
        @Query('minRating') minRating?: number,
        @Query('subcategories') subcategoriesParam?: string,
    ): Promise<PaginatedProductsResponse> {
        try {
            const brands = brandsParam ? brandsParam.split(',') : undefined;

            let subcategoryFilters: Record<string, string[]> | undefined;

            if (subcategoriesParam) {
                try {
                    const decodedParam = decodeURIComponent(subcategoriesParam);
                    subcategoryFilters = JSON.parse(decodedParam);

                    if (
                        typeof subcategoryFilters !== 'object' ||
                        subcategoryFilters === null
                    ) {
                        throw new BadRequestException(
                            'Subcategories must be a valid object',
                        );
                    }

                    Object.entries(subcategoryFilters).forEach(
                        ([key, value]) => {
                            if (!Array.isArray(value)) {
                                subcategoryFilters[key] = [String(value)];
                            } else if (value.length === 0) {
                                delete subcategoryFilters[key];
                            }
                        },
                    );

                    if (Object.keys(subcategoryFilters).length === 0) {
                        subcategoryFilters = undefined;
                    }
                } catch (parseError) {
                    throw new BadRequestException(
                        'Invalid JSON in subcategories parameter',
                    );
                }
            }

            const result = await this.productService.findByCategory(
                category,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
                subcategoryFilters,
            );

            if (result.products && Array.isArray(result.products)) {
                result.products = result.products.map((product) =>
                    this.ensureProductInfo(product),
                );
            }

            return result;
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Failed to retrieve products by category',
            );
        }
    }

    @Get('subcategory-values/:category/:subcategory')
    async getSubcategoryValues(
        @Param('category') category: string,
        @Param('subcategory') subcategory: string,
    ): Promise<string[]> {
        try {
            return await this.productService.getSubcategoryValues(
                category,
                subcategory,
            );
        } catch (error) {
            throw new InternalServerErrorException(
                `Failed to retrieve ${subcategory} values for ${category}`,
            );
        }
    }

    @Get('subcategory-keys/:category')
    async getSubcategoryKeys(
        @Param('category') category: string,
    ): Promise<{ keys: string[] }> {
        try {
            const keys = await this.productService.getSubcategoryKeys(category);
            return { keys };
        } catch (error) {
            throw new InternalServerErrorException(
                `Failed to retrieve specification keys for ${category}`,
            );
        }
    }

    @Get('landing-page-products')
    async getLandingPageProducts(): Promise<ProductDetailsDto[]> {
        try {
            const products = await this.productService.getLandingPageProducts();
            return products.map((product) => this.ensureProductInfo(product));
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to retrieve landing page products',
            );
        }
    }

    @Get('search')
    async searchProducts(
        @Query('query') query: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 12,
        @Query('brands') brandsParam?: string,
        @Query('minPrice') minPrice?: number,
        @Query('maxPrice') maxPrice?: number,
        @Query('minRating') minRating?: number,
    ): Promise<PaginatedProductsResponse> {
        try {
            const brands = brandsParam ? brandsParam.split(',') : undefined;
            const result = await this.productService.searchByName(
                query,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
            );

            if (result.products && Array.isArray(result.products)) {
                result.products = result.products.map((product) =>
                    this.ensureProductInfo(product),
                );
            }

            return result;
        } catch (error) {
            throw new InternalServerErrorException('Failed to search products');
        }
    }

    @Get('search-suggestions')
    async getSearchSuggestions(
        @Query('query') query: string,
    ): Promise<string[]> {
        try {
            return await this.productService.getSearchSuggestions(query);
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to get search suggestions',
            );
        }
    }

    @Post('admin/reindex')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async reindexProducts(): Promise<{ success: boolean; message: string }> {
        try {
            await this.productService.reindexProducts();
            return {
                success: true,
                message: 'Product reindexing started successfully',
            };
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to start product reindex',
            );
        }
    }

    @Post('reindex')
    async reindexProductsForDev(): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            await this.productService.reindexProducts();
            return {
                success: true,
                message: 'Product reindexing started successfully',
            };
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to start product reindex',
            );
        }
    }

    @Get('categories')
    async getCategories(): Promise<{ categories: string[] }> {
        try {
            const categories = await this.productService.getAllCategories();
            return { categories };
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to retrieve categories',
            );
        }
    }

    @Post('batch-with-discounts')
    async getProductsWithDiscounts(
        @Body() data: { productIds: string[] },
    ): Promise<{ success: boolean; products: ProductDetailsDto[] }> {
        try {
            if (!data.productIds || data.productIds.length === 0) {
                return { success: true, products: [] };
            }

            const products = await this.productService.getProductsWithDiscounts(
                data.productIds,
            );

            return {
                success: true,
                products: products.map((product) =>
                    this.ensureProductInfo(product),
                ),
            };
        } catch (error) {
            throw new InternalServerErrorException(
                `Failed to fetch products batch with discounts: ${error.message}`,
            );
        }
    }

    @Get('hot-sales')
    async getHotSalesProducts(): Promise<ProductDetailsDto[]> {
        try {
            // Get product IDs from hot sales
            const productIds = await this.hotSalesService.findAllProductIds();

            // Get the actual products with discounts
            const products =
                await this.productService.getProductsWithDiscounts(productIds);

            return products.map((product) => this.ensureProductInfo(product));
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to retrieve hot sales products',
            );
        }
    }

    @Post('admin/hot-sales/:productId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async addToHotSales(
        @Param('productId') productId: string,
        @Body() data: { displayOrder?: number },
    ): Promise<{ success: boolean; message: string }> {
        try {
            await this.hotSalesService.add(productId, data.displayOrder || 0);
            return {
                success: true,
                message: 'Product added to hot sales successfully',
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(
                `Failed to add product to hot sales: ${error.message}`,
            );
        }
    }

    @Delete('admin/hot-sales/:productId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async removeFromHotSales(
        @Param('productId') productId: string,
    ): Promise<{ success: boolean; message: string }> {
        try {
            await this.hotSalesService.remove(productId);
            return {
                success: true,
                message: 'Product removed from hot sales successfully',
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(
                `Failed to remove product from hot sales: ${error.message}`,
            );
        }
    }

    @Put('admin/hot-sales/:productId/order')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async updateHotSalesOrder(
        @Param('productId') productId: string,
        @Body() data: { displayOrder: number },
    ): Promise<{ success: boolean; message: string }> {
        try {
            await this.hotSalesService.updateDisplayOrder(
                productId,
                data.displayOrder,
            );
            return {
                success: true,
                message: 'Hot sales display order updated successfully',
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(
                `Failed to update hot sales order: ${error.message}`,
            );
        }
    }

    @Get('hot-sales-filtered')
    async getFilteredHotSalesProducts(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 12,
        @Query('brands') brandsParam?: string,
        @Query('minPrice') minPrice?: number,
        @Query('maxPrice') maxPrice?: number,
        @Query('minRating') minRating?: number,
        @Query('sortBy') sortBy: string = 'popular',
        @Query('search') search?: string,
    ): Promise<PaginatedProductsResponse> {
        try {
            const brands = brandsParam ? brandsParam.split(',') : undefined;

            // Get all hot sales product IDs
            const hotSalesProductIds =
                await this.hotSalesService.findAllProductIds();

            if (hotSalesProductIds.length === 0) {
                return { products: [], total: 0, pages: 0, page };
            }

            // Get products with discounts
            let products =
                await this.productService.getProductsWithDiscounts(
                    hotSalesProductIds,
                );

            // Apply filters
            if (brands && brands.length > 0) {
                products = products.filter((product) =>
                    brands.includes(product.brand),
                );
            }

            if (minPrice !== undefined) {
                products = products.filter(
                    (product) => product.price >= minPrice,
                );
            }

            if (maxPrice !== undefined) {
                products = products.filter(
                    (product) => product.price <= maxPrice,
                );
            }

            if (minRating !== undefined) {
                products = products.filter(
                    (product) => product.rating >= minRating,
                );
            }

            // Apply search filter if provided
            if (search && search.trim() !== '') {
                const normalizedSearch = search.toLowerCase().trim();
                products = products.filter(
                    (product) =>
                        product.name.toLowerCase().includes(normalizedSearch) ||
                        (product.description &&
                            product.description
                                .toLowerCase()
                                .includes(normalizedSearch)),
                );
            }

            // Get total before pagination for response
            const total = products.length;

            // Apply sorting
            if (sortBy) {
                switch (sortBy) {
                    case 'price-asc':
                        products.sort((a, b) => a.price - b.price);
                        break;
                    case 'price-desc':
                        products.sort((a, b) => b.price - a.price);
                        break;
                    case 'newest':
                        products.sort((a, b) => {
                            const dateA = a.createdAt
                                ? new Date(a.createdAt).getTime()
                                : 0;
                            const dateB = b.createdAt
                                ? new Date(b.createdAt).getTime()
                                : 0;
                            return dateB - dateA;
                        });
                        break;
                    case 'rating':
                        products.sort((a, b) => b.rating - a.rating);
                        break;
                    case 'discount':
                        products.sort(
                            (a, b) =>
                                (b.discountPercentage || 0) -
                                (a.discountPercentage || 0),
                        );
                        break;
                    // Default is 'popular', no need to sort
                }
            }

            // Apply pagination
            const pages = Math.ceil(total / limit);
            const startIndex = (page - 1) * limit;
            const paginatedProducts = products.slice(
                startIndex,
                startIndex + limit,
            );

            return {
                products: paginatedProducts.map((product) =>
                    this.ensureProductInfo(product),
                ),
                total,
                pages,
                page,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching filtered hot sales: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to retrieve filtered hot sales products',
            );
        }
    }

    @Get('preferred-categories')
    async getPreferredCategories(
        @Query('customerId') customerId?: number,
        @Query('sessionId') sessionId?: string,
        @Query('limit') limit: number = 5,
    ): Promise<{ categories: string[] }> {
        try {
            const categories =
                await this.recommendationService.getPreferredCategories(
                    customerId,
                    sessionId,
                    limit,
                );

            return { categories };
        } catch (error) {
            this.logger.error(
                `Error getting preferred categories: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to get preferred categories',
            );
        }
    }

    @Get('recommendations')
    async getRecommendedProducts(
        @Query('customerId') customerId?: number,
        @Query('sessionId') sessionId?: string,
        @Query('productId') productId?: string,
        @Query('category') category?: string,
        @Query('limit') limit: number = 4,
    ): Promise<{ products: ProductDetailsDto[] }> {
        try {
            const products =
                await this.recommendationService.getRecommendedProducts(
                    customerId,
                    sessionId,
                    productId,
                    category,
                    limit,
                );

            // Process products to ensure all expected fields
            const processedProducts = products.map((product) =>
                this.ensureProductInfo(product),
            );

            return { products: processedProducts };
        } catch (error) {
            this.logger.error(
                `Error getting recommendations: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to get product recommendations',
            );
        }
    }

    @Get('category-recommendations/:category')
    async getCategoryRecommendations(
        @Param('category') category: string,
        @Query('limit') limit: number = 10,
    ): Promise<{ products: ProductDetailsDto[] }> {
        try {
            if (!category) {
                throw new BadRequestException('Category is required');
            }

            const products =
                await this.recommendationService.getCategoryRecommendations(
                    category,
                    limit,
                );

            // Process products to ensure all expected fields
            const processedProducts = products.map((product) =>
                this.ensureProductInfo(product),
            );

            return { products: processedProducts };
        } catch (error) {
            this.logger.error(
                `Error getting category recommendations: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to get category recommendations',
            );
        }
    }

    @Get(':slug')
    async findBySlug(@Param('slug') slug: string): Promise<ProductDetailsDto> {
        try {
            const product = await this.productService.findBySlug(slug);
            return this.ensureProductInfo(product);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Failed to retrieve product',
            );
        }
    }

    @Post('upload-image')
    @UseInterceptors(FileInterceptor('image'))
    async uploadImage(@UploadedFile() file: Express.Multer.File) {
        try {
            if (!file) {
                throw new BadRequestException('No image file provided');
            }

            const validMimeTypes = [
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif',
            ];
            if (!validMimeTypes.includes(file.mimetype)) {
                throw new BadRequestException(
                    'Invalid file type. Only JPG, PNG, WebP, and GIF are allowed',
                );
            }

            const result = await this.cloudinaryService.uploadImage(file);

            return {
                success: true,
                imageUrl: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to upload image: ${error.message}`,
            );
        }
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async createProduct(@Body() productData: any): Promise<any> {
        try {
            // Create the product in PostgreSQL first, which will generate a UUID
            const createdProduct =
                await this.productService.createProduct(productData);

            // Return the created product with its ID
            return {
                success: true,
                message: 'Product created successfully',
                product: createdProduct,
            };
        } catch (error) {
            this.logger.error(`Failed to create product: ${error.message}`);
            throw new InternalServerErrorException(
                `Failed to create product: ${error.message}`,
            );
        }
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async updateProduct(
        @Param('id') id: string,
        @Body() productData: any,
    ): Promise<any> {
        try {
            // Update the product in PostgreSQL and Neo4j
            const updatedProduct = await this.productService.updateProduct(
                id,
                productData,
            );

            return {
                success: true,
                message: 'Product updated successfully',
                product: updatedProduct,
            };
        } catch (error) {
            this.logger.error(`Failed to update product: ${error.message}`);
            throw new InternalServerErrorException(
                `Failed to update product: ${error.message}`,
            );
        }
    }

    // @Post('admin/migrate-images')
    // @UseGuards(JwtAuthGuard, RolesGuard)
    // @Roles(Role.ADMIN)
    // async migrateImagesFromNeo4j(): Promise<{ success: boolean; message: string; migrated: number }> {
    //     try {
    //         const result = await this.productService.migrateImagesFromNeo4j();
    //         return {
    //             success: true,
    //             message: 'Image URLs successfully migrated from Neo4j',
    //             migrated: result.migratedCount
    //         };
    //     } catch (error) {
    //         this.logger.error(`Failed to migrate images from Neo4j: ${error.message}`);
    //         throw new InternalServerErrorException(
    //             `Failed to migrate images: ${error.message}`
    //         );
    //     }
    // }

    

    private ensureProductDiscountInfo(product: any): any {
        const MIN_DISCOUNT_PERCENT = 1.0;
        const MIN_DISCOUNT_AMOUNT = 50000;

        if (product.originalPrice && product.originalPrice > product.price) {
            const priceDifference = product.originalPrice - product.price;
            const percentDifference =
                (priceDifference / product.originalPrice) * 100;

            const isSignificantPercent =
                percentDifference >= MIN_DISCOUNT_PERCENT;
            const isSignificantAmount = priceDifference >= MIN_DISCOUNT_AMOUNT;

            if (isSignificantPercent || isSignificantAmount) {
                product.isDiscounted = true;

                if (!product.discountPercentage) {
                    product.discountPercentage = Math.round(percentDifference);
                }
            } else {
                product.isDiscounted = false;
                product.discountPercentage = undefined;
            }
        }

        return product;
    }

    private ensureProductInfo(product: any): any {
        product = this.ensureProductDiscountInfo(product);

        if (
            !product.categories ||
            !Array.isArray(product.categories) ||
            product.categories.length === 0
        ) {
            product.categories = [];

            if (
                product.category &&
                typeof product.category === 'string' &&
                !product.categories.includes(product.category)
            ) {
                product.categories.push(product.category);
            }

            this.addSpecificCategoryMappings(product);
        }

        return product;
    }

    private addSpecificCategoryMappings(product: any): void {
        const name = product.name?.toLowerCase() || '';

        if (
            name.includes('rtx') ||
            name.includes('gtx') ||
            name.includes('geforce') ||
            name.includes('radeon') ||
            name.includes('graphics card')
        ) {
            const gpuCategories = ['GPU', 'GraphicsCard', 'Graphics Card'];
            gpuCategories.forEach((category) => {
                if (!product.categories.includes(category)) {
                    product.categories.push(category);
                }
            });
        }
    }
}
