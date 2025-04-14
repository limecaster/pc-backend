import { Controller, Get, UseGuards, Req, Delete, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ViewedProductsService } from '../services/viewed-products.service';
import { Request } from 'express';

@Controller('viewed-products')
export class ViewedProductsController {
    constructor(
        private readonly viewedProductsService: ViewedProductsService,
    ) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    async getViewedProducts(
        @Req() req: Request,
        @Query('limit') limit?: number,
    ) {
        const customerId = req.user['id'];
        return this.viewedProductsService.getViewedProducts(customerId, limit);
    }

    @Delete()
    @UseGuards(JwtAuthGuard)
    async clearViewedProducts(@Req() req: Request) {
        const customerId = req.user['id'];
        await this.viewedProductsService.clearViewedProducts(customerId);
        return { message: 'Viewed products cleared successfully' };
    }
}
