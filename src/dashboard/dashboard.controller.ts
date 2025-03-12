import {
    Controller,
    Get,
    UseGuards,
    Query,
    Param,
    ParseIntPipe,
    DefaultValuePipe,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) {}

    @Get('summary')
    async getDashboardSummary() {
        return this.dashboardService.getDashboardSummary();
    }

    @Get('sales-data')
    async getSalesData(@Query('period') period: string = 'week') {
        return this.dashboardService.getSalesData(period);
    }

    @Get('product-categories')
    async getProductCategories() {
        return this.dashboardService.getProductCategories();
    }

    @Get('order-statuses')
    async getOrderStatuses() {
        return this.dashboardService.getOrderStatuses();
    }

    @Get('recent-orders')
    async getRecentOrders(
        @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
    ) {
        return this.dashboardService.getRecentOrders(limit);
    }

    @Get('customer-growth')
    async getCustomerGrowth(@Query('period') period: string = 'year') {
        return this.dashboardService.getCustomerGrowth(period);
    }

    @Get('top-products')
    async getTopSellingProducts(
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('period') period: string = 'month',
    ) {
        return this.dashboardService.getTopSellingProducts(limit, period);
    }
}
