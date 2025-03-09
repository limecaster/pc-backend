import { Controller, Get, Param, NotFoundException, Post, Query } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductDetailsDto } from './dto/product-response.dto';

// Define interface for paginated response
interface PaginatedProductsResponse {
  products: ProductDetailsDto[];
  total: number;
  pages: number;
  page: number;
}

@Controller('products')
export class ProductController {
    constructor(private readonly productService: ProductService) {}

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

    // @Post('import-from-neo4j')
    // async importFromNeo4j() {
    //     try {
    //         return await this.productService.importProductsFromNeo4j();
    //     } catch (error) {
    //         console.error('Error importing products:', error);
    //         throw new Error('Failed to import products from Neo4j');
    //     }
    // }
}
