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
            return await this.productService.findByCategory(
                undefined,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
            );
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
                    subcategoryFilters = JSON.parse(
                        decodeURIComponent(subcategoriesParam),
                    );
                } catch (error) {
                    throw new BadRequestException(
                        'Invalid subcategories format',
                    );
                }
            }

            return await this.productService.findByCategory(
                category,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
                subcategoryFilters,
            );
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
            return await this.productService.getLandingPageProducts();
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
            return await this.productService.searchByName(
                query,
                page,
                limit,
                brands,
                minPrice,
                maxPrice,
                minRating,
            );
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

    @Get(':slug')
    async findBySlug(@Param('slug') slug: string): Promise<ProductDetailsDto> {
        try {
            return await this.productService.findBySlug(slug);
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
}
