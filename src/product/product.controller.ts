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
    ) {}

    @Get('debug/simple-list')
    async debugSimpleProductList(): Promise<{ status: string, message: string }> {
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

    @Get('admin/simple-list')
    async getSimpleProductList(
        @Query('search') search?: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10
    ): Promise<{ products: { id: string, name: string }[], total: number, pages: number }> {
        try {
            return await this.productService.getSimpleProductList(search, page, limit);
        } catch (error) {
            throw new InternalServerErrorException('Failed to retrieve product list');
        }
    }

    @Get('stock')
    async getProductsStockQuantities(@Query('ids') ids: string) {
        try {
            if (!ids) {
                return { success: true, stocks: {} };
            }
            
            const productIds = ids.split(',').filter(id => id);
            
            if (productIds.length === 0) {
                return { success: true, stocks: {} };
            }
            
            const stocks = await this.productService.getStockQuantities(productIds);
            return {
                success: true,
                stocks
            };
        } catch (error) {
            throw new HttpException(
                `Failed to get product stock quantities: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
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
                result.products = result.products.map(product => 
                    this.ensureProductInfo(product)
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
            return await this.productService.findBySlug(id);
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
                result.products = result.products.map(product => 
                    this.ensureProductInfo(product)
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

    @Get('landing-page-products')
    async getLandingPageProducts(): Promise<ProductDetailsDto[]> {
        try {
            const products = await this.productService.getLandingPageProducts();
            return products.map(product => this.ensureProductInfo(product));
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
                result.products = result.products.map(product => 
                    this.ensureProductInfo(product)
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

    @Get('admin/debug')
    async adminDebug(): Promise<{ status: string }> {
        return { status: 'Product controller admin routes are working' };
    }

    @Post('batch-with-discounts')
    async getProductsWithDiscounts(
        @Body() data: { productIds: string[] }
    ): Promise<{ success: boolean; products: ProductDetailsDto[] }> {
        try {
            if (!data.productIds || data.productIds.length === 0) {
                return { success: true, products: [] };
            }
            
            const products = await this.productService.getProductsWithDiscounts(data.productIds);
            
            return {
                success: true,
                products: products.map(product => this.ensureProductInfo(product)),
            };
        } catch (error) {
            throw new InternalServerErrorException(
                `Failed to fetch products batch with discounts: ${error.message}`
            );
        }
    }

    @Get('hot-sales')
    async getHotSalesProducts(): Promise<ProductDetailsDto[]> {
        try {
            // Get product IDs from hot sales
            const productIds = await this.hotSalesService.findAllProductIds();
            
            // Get the actual products with discounts
            const products = await this.productService.getProductsWithDiscounts(productIds);
            
            return products.map(product => this.ensureProductInfo(product));
        } catch (error) {
            throw new InternalServerErrorException('Failed to retrieve hot sales products');
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
            throw new InternalServerErrorException(`Failed to add product to hot sales: ${error.message}`);
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
            throw new InternalServerErrorException(`Failed to remove product from hot sales: ${error.message}`);
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
            await this.hotSalesService.updateDisplayOrder(productId, data.displayOrder);
            return {
                success: true,
                message: 'Hot sales display order updated successfully',
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(`Failed to update hot sales order: ${error.message}`);
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

    private ensureProductDiscountInfo(product: any): any {
        const MIN_DISCOUNT_PERCENT = 1.0;
        const MIN_DISCOUNT_AMOUNT = 50000;

        if (product.originalPrice && product.originalPrice > product.price) {
            const priceDifference = product.originalPrice - product.price;
            const percentDifference = (priceDifference / product.originalPrice) * 100;

            const isSignificantPercent = percentDifference >= MIN_DISCOUNT_PERCENT;
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

        if (!product.categories || !Array.isArray(product.categories) || product.categories.length === 0) {
            product.categories = [];

            if (product.category && typeof product.category === 'string' && 
                !product.categories.includes(product.category)) {
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
            gpuCategories.forEach(category => {
                if (!product.categories.includes(category)) {
                    product.categories.push(category);
                }
            });
        }
    }
}
