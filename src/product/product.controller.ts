import { Controller, Get, Param, NotFoundException, Post } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductDetailsDto } from './dto/product-response.dto';

@Controller('products')
export class ProductController {
    constructor(private readonly productService: ProductService) {}

    @Get('category/:category')
    async findByCategory(@Param('category') category: string): Promise<ProductDetailsDto[]> {
        try {
            return await this.productService.findByCategory(category);
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
