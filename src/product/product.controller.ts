import { Controller, Get, Param, NotFoundException, Post, Query, UseInterceptors, UploadedFile, BadRequestException, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductDetailsDto } from './dto/product-response.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryConfigService } from '../config/cloudinary.config';
import { Express } from 'express'; // Add this import
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum'; // Add this import for the Role enum

// Define interface for paginated response
interface PaginatedProductsResponse {
  products: ProductDetailsDto[];
  total: number;
  pages: number;
  page: number;
}

@Controller('products')
export class ProductController {
    constructor(
        private readonly productService: ProductService,
        private readonly cloudinaryService: CloudinaryConfigService,
    ) {}

    @Get('brands')
    async getAllBrands(): Promise<string[]> {
        try {
            return await this.productService.getAllBrands();
        } catch (error) {
            console.error('Error retrieving brands:', error);
            throw new Error('Failed to retrieve brands');
        }
    }

    @Get('all')
    async getAllProducts(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 12,
        @Query('brands') brandsParam?: string,
        @Query('minPrice') minPrice?: number,
        @Query('maxPrice') maxPrice?: number,
        @Query('minRating') minRating?: number
    ): Promise<PaginatedProductsResponse> {
        try {
            const brands = brandsParam ? brandsParam.split(',') : undefined;
            return await this.productService.findByCategory(undefined, page, limit, brands, minPrice, maxPrice, minRating);
        } catch (error) {
            console.error('Error retrieving all products:', error);
            throw new Error('Failed to retrieve all products');
        }
    }

    @Get('admin/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN) // Fix here: use the enum value instead of string literal
    async getAllProductsForAdmin(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 12,
        @Query('sortBy') sortBy: string = 'createdAt',
        @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC'
    ): Promise<PaginatedProductsResponse> {
        try {
            return await this.productService.findAllProductsForAdmin(
                page, 
                limit, 
                sortBy, 
                sortOrder
            );
        } catch (error) {
            console.error('Error retrieving all products for admin:', error);
            throw new Error('Failed to retrieve all products for admin');
        }
    }

    @Get('admin/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async getProductByIdForAdmin(@Param('id') id: string): Promise<ProductDetailsDto> {
        try {
            return await this.productService.findByIdForAdmin(id);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            console.error('Error retrieving product for admin:', error);
            throw new Error('Failed to retrieve product for admin');
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
        @Query('minRating') minRating?: number
    ): Promise<PaginatedProductsResponse> {
        try {
            const brands = brandsParam ? brandsParam.split(',') : undefined;
            return await this.productService.findByCategory(category, page, limit, brands, minPrice, maxPrice, minRating);
        } catch (error) {
            console.error('Error retrieving products by category:', error);
            throw new Error('Failed to retrieve products by category');
        }
    }

    @Get('landing-page-products')
    async getLandingPageProducts() {
        try {
            return await this.productService.getLandingPageProducts();
        } catch (error) {
            console.error('Error retrieving landing page products:', error);
            throw new Error('Failed to retrieve landing page products');
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
        @Query('minRating') minRating?: number
    ): Promise<PaginatedProductsResponse> {
        try {
            const brands = brandsParam ? brandsParam.split(',') : undefined;
            return await this.productService.searchByName(query, page, limit, brands, minPrice, maxPrice, minRating);
        } catch (error) {
            console.error('Error searching products:', error);
            throw new Error('Failed to search products');
        }
    }

    @Get('categories')
    async getCategories() {
        try {
            // Get unique categories from products
            const categories = await this.productService.getAllCategories();
            return { categories };
        } catch (error) {
            console.error('Error retrieving categories:', error);
            throw new Error('Failed to retrieve categories');
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
            console.error('Error retrieving product:', error);
            throw new Error('Failed to retrieve product');
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
            const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!validMimeTypes.includes(file.mimetype)) {
                throw new BadRequestException('Invalid file type. Only JPG, PNG, WebP, and GIF are allowed');
            }

            // Upload to Cloudinary
            const result = await this.cloudinaryService.uploadImage(file);

            // Return the secure URL for the frontend to use
            return {
                success: true,
                imageUrl: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            throw new BadRequestException(`Failed to upload image: ${error.message}`);
        }
    }
}
