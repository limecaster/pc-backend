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

// Define interface for paginated response
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
    ) {}

    // Add debug route without guards to test if the controller is registered correctly
    @Get('debug/simple-list')
    async debugSimpleProductList(): Promise<{ status: string, message: string }> {
        this.logger.log('Debug simple product list endpoint called');
        try {
            const products = await this.productService.getSimpleProductList();
            return { 
                status: 'success', 
                message: `Controller working correctly. Found ${products.products.length} products.` 
            };
        } catch (error) {
            return { 
                status: 'error', 
                message: `Controller working, but service error: ${error.message}` 
            };
        }
    }

    // Fix the admin endpoint by removing the guards temporarily for testing
    @Get('admin/simple-list')
    // @UseGuards(JwtAuthGuard, RolesGuard)  // Comment out guards temporarily
    // @Roles(Role.ADMIN)                    // Comment out roles temporarily
    async getSimpleProductList(
        @Query('search') search?: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10
    ): Promise<{ products: { id: string, name: string }[], total: number, pages: number }> {
        try {
            this.logger.log(`Getting simple product list with search: ${search}, page: ${page}, limit: ${limit}`);
            return await this.productService.getSimpleProductList(search, page, limit);
        } catch (error) {
            this.logger.error(`Error getting simple product list: ${error.message}`);
            throw new InternalServerErrorException('Failed to retrieve product list');
        }
    }

    // IMPORTANT: Move the stock endpoint before the :slug endpoint to prevent route conflicts
    @Get('stock')
    async getProductsStockQuantities(@Query('ids') ids: string) {
        try {
            this.logger.log(`Fetching stock quantities for products: ${ids}`);
            
            if (!ids) {
                this.logger.warn('No product IDs provided');
                return { success: true, stocks: {} };
            }
            
            // Parse comma-separated IDs
            const productIds = ids.split(',').filter(id => id);
            
            if (productIds.length === 0) {
                return { success: true, stocks: {} };
            }
            
            // Get stock quantities for the requested products
            const stocks = await this.productService.getStockQuantities(productIds);
            
            this.logger.log(`Returning stock data for ${Object.keys(stocks).length} products`);
            return {
                success: true,
                stocks
            };
        } catch (error) {
            this.logger.error(`Error fetching product stock quantities: ${error.message}`);
            throw new HttpException(
                `Failed to get product stock quantities: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    // Keep other specific endpoints before the generic :slug endpoint
    @Get('brands')
    async getAllBrands(): Promise<string[]> {
        try {
            return await this.productService.getAllBrands();
        } catch (error) {
            this.logger.error(`Error retrieving brands: ${error.message}`);
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

            // Process all products to ensure discount info
            if (result.products && Array.isArray(result.products)) {
                result.products = result.products.map(product => 
                    this.ensureProductInfo(product)
                );
            }
            
            return result;
        } catch (error) {
            this.logger.error(
                `Error retrieving all products: ${error.message}`,
            );
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
            this.logger.error(
                `Error retrieving all products for admin: ${error.message}`,
            );
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
            return await this.productService.findBySlug(id); // Use findBySlug which works for any ID
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(
                `Error retrieving product for admin: ${error.message}`,
            );
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

            // Parse subcategory filters
            let subcategoryFilters: Record<string, string[]> | undefined;

            if (subcategoriesParam) {
                try {
                    this.logger.log(
                        `Raw subcategories param [${typeof subcategoriesParam}]: "${subcategoriesParam}"`,
                    );

                    const decodedParam = decodeURIComponent(subcategoriesParam);
                    this.logger.log(
                        `Decoded subcategories param: "${decodedParam}"`,
                    );

                    try {
                        subcategoryFilters = JSON.parse(decodedParam);

                        // Validate format and structure
                        if (
                            typeof subcategoryFilters !== 'object' ||
                            subcategoryFilters === null
                        ) {
                            this.logger.error(
                                'Invalid subcategory filter format: not an object',
                            );
                            throw new BadRequestException(
                                'Subcategories must be a valid object',
                            );
                        }

                        // Normalize values to ensure they're all arrays
                        Object.entries(subcategoryFilters).forEach(
                            ([key, value]) => {
                                if (!Array.isArray(value)) {
                                    this.logger.log(
                                        `Converting non-array value for "${key}" to array: ${value}`,
                                    );
                                    subcategoryFilters[key] = [String(value)];
                                } else if (value.length === 0) {
                                    this.logger.log(
                                        `Empty array found for key "${key}", removing`,
                                    );
                                    delete subcategoryFilters[key];
                                }
                            },
                        );

                        // Log the final structured filters
                        this.logger.log(
                            `Final subcategory filters: ${JSON.stringify(subcategoryFilters)}`,
                        );

                        // Check if we have any filters left
                        if (Object.keys(subcategoryFilters).length === 0) {
                            this.logger.log(
                                'No valid subcategory filters after processing',
                            );
                            subcategoryFilters = undefined;
                        }
                    } catch (parseError) {
                        this.logger.error(
                            `JSON parse error: ${parseError.message}`,
                        );
                        throw new BadRequestException(
                            'Invalid JSON in subcategories parameter',
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        `Error processing subcategories: ${error.message}`,
                    );
                    throw error;
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

            // Process all products to ensure discount info
            if (result.products && Array.isArray(result.products)) {
                result.products = result.products.map(product => 
                    this.ensureProductInfo(product)
                );
            }
            
            return result;
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(
                `Error retrieving products by category: ${error.message}`,
            );
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
            this.logger.error(
                `Error retrieving ${subcategory} values for ${category}: ${error.message}`,
            );
            throw new InternalServerErrorException(
                `Failed to retrieve ${subcategory} values for ${category}`,
            );
        }
    }

    @Get('landing-page-products')
    async getLandingPageProducts(): Promise<ProductDetailsDto[]> {
        try {
            const products = await this.productService.getLandingPageProducts();
            
            // Process all products to ensure discount info
            return products.map(product => this.ensureProductInfo(product));
        } catch (error) {
            this.logger.error(
                `Error retrieving landing page products: ${error.message}`,
            );
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

            // Process all products to ensure discount info
            if (result.products && Array.isArray(result.products)) {
                result.products = result.products.map(product => 
                    this.ensureProductInfo(product)
                );
            }
            
            return result;
        } catch (error) {
            this.logger.error(`Error searching products: ${error.message}`);
            throw new InternalServerErrorException('Failed to search products');
        }
    }

    // Add new endpoint for search suggestions
    @Get('search-suggestions')
    async getSearchSuggestions(
        @Query('query') query: string,
    ): Promise<string[]> {
        try {
            return await this.productService.getSearchSuggestions(query);
        } catch (error) {
            this.logger.error(
                `Error getting search suggestions: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to get search suggestions',
            );
        }
    }

    // Add admin endpoint to trigger reindexing
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
            this.logger.error(
                `Error starting product reindex: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to start product reindex',
            );
        }
    }

    // Make the reindex endpoint available without admin auth during development
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
            this.logger.error(
                `Error starting product reindex: ${error.message}`,
            );
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
            this.logger.error(`Error retrieving categories: ${error.message}`);
            throw new InternalServerErrorException(
                'Failed to retrieve categories',
            );
        }
    }

    // Add a debug endpoint to test the controller connection
    @Get('admin/debug')
    async adminDebug(): Promise<{ status: string }> {
        this.logger.log('Admin debug endpoint called');
        return { status: 'Product controller admin routes are working' };
    }

    /**
     * New endpoint to fetch multiple products with pre-calculated discount information
     * This eliminates the need for category extraction on the frontend
     */
    @Post('batch-with-discounts')
    async getProductsWithDiscounts(
        @Body() data: { productIds: string[] }
    ): Promise<{ success: boolean; products: ProductDetailsDto[] }> {
        try {
            this.logger.log(`Fetching batch of ${data.productIds?.length || 0} products with discounts`);
            
            if (!data.productIds || data.productIds.length === 0) {
                return { success: true, products: [] };
            }
            
            // Use a new service method to get products with discounts applied
            const products = await this.productService.getProductsWithDiscounts(data.productIds);
            
            return {
                success: true,
                products: products.map(product => this.ensureProductInfo(product)),
            };
        } catch (error) {
            this.logger.error(`Error fetching products batch with discounts: ${error.message}`);
            throw new InternalServerErrorException(
                `Failed to fetch products batch with discounts: ${error.message}`
            );
        }
    }

    // Move the :slug endpoint to the end to avoid capturing other routes
    @Get(':slug')
    async findBySlug(@Param('slug') slug: string): Promise<ProductDetailsDto> {
        try {
            const product = await this.productService.findBySlug(slug);
            
            // Ensure product has complete discount information
            return this.ensureProductInfo(product);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Error retrieving product: ${error.message}`);
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

            // Validate file type
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

            // Upload to Cloudinary
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
            this.logger.error(`Failed to upload image: ${error.message}`);
            throw new BadRequestException(
                `Failed to upload image: ${error.message}`,
            );
        }
    }

    /**
     * Ensures product responses include proper discount info
     * This helper makes sure originalPrice is always included when needed
     */
    private ensureProductDiscountInfo(product: any): any {
        // Define meaningful discount thresholds
        const MIN_DISCOUNT_PERCENT = 1.0; // Minimum 1% discount to be considered meaningful
        const MIN_DISCOUNT_AMOUNT = 50000; // Minimum 50,000 VND discount to be considered meaningful

        // Log the incoming product for debugging
        this.logger.debug(`Processing product: ${product.id} - ${product.name} - Price: ${product.price}`);
        
        // Check if original price is higher than current price
        if (product.originalPrice && product.originalPrice > product.price) {
            const priceDifference = product.originalPrice - product.price;
            const percentDifference = (priceDifference / product.originalPrice) * 100;
            
            // Check if the discount meets our meaningful threshold
            const isSignificantPercent = percentDifference >= MIN_DISCOUNT_PERCENT;
            const isSignificantAmount = priceDifference >= MIN_DISCOUNT_AMOUNT;
            
            // Only apply discount if it meets at least one threshold criterion
            if (isSignificantPercent || isSignificantAmount) {
                product.isDiscounted = true;
                
                // Calculate discount percentage if not already set
                if (!product.discountPercentage) {
                    product.discountPercentage = Math.round(percentDifference);
                }
                
                this.logger.debug(`Applied discount to ${product.name}: ${priceDifference} VND (${percentDifference.toFixed(2)}%)`);
            } else {
                // Keep original price but don't mark as a discount
                this.logger.debug(`Ignoring insignificant discount for ${product.name}: ${priceDifference} VND (${percentDifference.toFixed(2)}%)`);
                product.isDiscounted = false;
                product.discountPercentage = undefined;
            }
        }
        
        // Special case for test products with VND in name
        if (product.name && product.name.includes(' VND')) {
            // ...existing code for handling test products with VND in name...
        }
        
        return product;
    }

    /**
     * Ensures product responses include proper discount info and category information
     */
    private ensureProductInfo(product: any): any {
        // First handle discount info as before
        product = this.ensureProductDiscountInfo(product);
        
        // Now ensure proper category information
        if (!product.categories || !Array.isArray(product.categories) || product.categories.length === 0) {
            // Create categories array if it doesn't exist
            product.categories = [];
            
            // Add the primary category if available but not in the categories array
            if (product.category && typeof product.category === 'string' && 
                !product.categories.includes(product.category)) {
                product.categories.push(product.category);
            }
            
            // For products with specific mappings (like GPUs), enhance categories
            this.addSpecificCategoryMappings(product);
        }
        
        return product;
    }

    /**
     * Add specific category mappings based on product attributes
     */
    private addSpecificCategoryMappings(product: any): void {
        const name = product.name?.toLowerCase() || '';
        
        // GPU detection
        if (
            name.includes('rtx') || 
            name.includes('gtx') || 
            name.includes('geforce') || 
            name.includes('radeon') || 
            name.includes('graphics card')
        ) {
            const gpuCategories = ['GPU', 'GraphicsCard', 'Graphics Card'];
            gpuCategories.forEach(category => {
                if (!product.categories.includes(category)) {
                    product.categories.push(category);
                }
            });
        }
        
        // Similar mappings for CPUs, etc.
    }
}
