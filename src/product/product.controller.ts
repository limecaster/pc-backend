import { Controller, Get, Param, NotFoundException, Post } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductDetailsDto } from './dto/product-response.dto';

@Controller('products')
export class ProductController {
    constructor(private readonly productService: ProductService) {}

    @Get(':slug')
    async findBySlug(@Param('slug') slug: string): Promise<ProductDetailsDto> {
        try {
            console.log("slug", slug);
            return await this.productService.findBySlug(slug);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            console.error('Error retrieving product:', error);
            throw new Error('Failed to retrieve product');
        }
    }

    @Post('import-from-neo4j')
    async importFromNeo4j() {
        try {
            return await this.productService.importProductsFromNeo4j();
        } catch (error) {
            console.error('Error importing products:', error);
            throw new Error('Failed to import products from Neo4j');
        }
    }
}
