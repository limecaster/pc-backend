import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HotSales } from '../entities/hot-sales.entity';
import { Product } from '../product.entity';

@Injectable()
export class HotSalesService {
    constructor(
        @InjectRepository(HotSales)
        private hotSalesRepository: Repository<HotSales>,
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
    ) {}

    async findAll(): Promise<HotSales[]> {
        return this.hotSalesRepository.find({
            relations: ['product'],
            order: {
                displayOrder: 'ASC',
            },
        });
    }

    async findAllProductIds(): Promise<string[]> {
        const hotSales = await this.hotSalesRepository.find({
            select: ['productId'],
            order: {
                displayOrder: 'ASC',
            },
        });
        return hotSales.map(item => item.productId);
    }

    async add(productId: string, displayOrder: number = 0): Promise<HotSales> {
        // Check if product exists
        const product = await this.productRepository.findOne({
            where: { id: productId },
        });
        
        if (!product) {
            throw new NotFoundException(`Product with ID ${productId} not found`);
        }

        // Check if product is already in hot sales
        const existing = await this.hotSalesRepository.findOne({
            where: { productId },
        });

        if (existing) {
            // If it already exists, just update the display order
            existing.displayOrder = displayOrder;
            return this.hotSalesRepository.save(existing);
        }

        // Create new hot sales entry
        const hotSale = this.hotSalesRepository.create({
            productId,
            displayOrder,
        });

        return this.hotSalesRepository.save(hotSale);
    }

    async remove(productId: string): Promise<void> {
        const result = await this.hotSalesRepository.delete({ productId });
        
        if (result.affected === 0) {
            throw new NotFoundException(`Product with ID ${productId} not found in hot sales`);
        }
    }

    async updateDisplayOrder(productId: string, displayOrder: number): Promise<HotSales> {
        const hotSale = await this.hotSalesRepository.findOne({
            where: { productId },
        });
        
        if (!hotSale) {
            throw new NotFoundException(`Product with ID ${productId} not found in hot sales`);
        }
        
        hotSale.displayOrder = displayOrder;
        return this.hotSalesRepository.save(hotSale);
    }
}
