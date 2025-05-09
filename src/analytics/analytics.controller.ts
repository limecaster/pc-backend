import {
    Controller,
    Get,
    Query,
    UseGuards,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ParseDate } from '../common/decorators/parse-date.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AnalyticsController {
    private readonly logger = new Logger(AnalyticsController.name);

    constructor(private readonly analyticsService: AnalyticsService) {}

    @Get('sales')
    async getSalesReport(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getSalesReport(startDate, endDate);
    }

    @Get('sales-report')
    async getSalesReportAlias(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getSalesReport(startDate, endDate);
    }

    @Get('best-selling-products')
    async getBestSellingProducts(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getBestSellingProducts(startDate, endDate);
    }

    @Get('best-selling-categories')
    async getBestSellingCategories(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getBestSellingCategories(
            startDate,
            endDate,
        );
    }

    @Get('user-behavior')
    async getUserBehavior(
        @Query('startDate') startDateStr: string,
        @Query('endDate') endDateStr: string,
    ) {
        const { startDate, endDate } = this.validateDates(
            startDateStr,
            endDateStr,
        );
        return this.analyticsService.getUserBehaviorMetrics(startDate, endDate);
    }

    @Get('user-engagement')
    async getUserEngagementMetrics(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getUserEngagementMetrics(
            startDate,
            endDate,
        );
    }

    @Get('most-viewed-products')
    async getMostViewedProducts(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getMostViewedProducts(startDate, endDate);
    }

    @Get('conversion-rates')
    async getConversionRates(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getConversionRates(startDate, endDate);
    }

    @Get('inventory')
    async getInventoryReport() {
        return this.analyticsService.getInventoryReport();
    }

    @Get('inventory-report')
    async getInventoryReportAlias() {
        return this.analyticsService.getInventoryReport();
    }

    @Get('inventory/low-stock')
    async getLowStockProducts(
        @Query('page') page = 1,
        @Query('limit') limit = 10,
        @Query('search') search = '',
    ) {
        return this.analyticsService.getLowStockProducts(+page, +limit, search);
    }

    @Get('inventory/out-of-stock')
    async getOutOfStockProducts(
        @Query('page') page = 1,
        @Query('limit') limit = 10,
        @Query('search') search = '',
    ) {
        return this.analyticsService.getOutOfStockProducts(
            +page,
            +limit,
            search,
        );
    }

    @Get('inventory/categories')
    async getProductCategories() {
        return this.analyticsService.getProductCategories();
    }

    @Get('abandoned-carts')
    async getAbandonedCarts(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getAbandonedCarts(startDate, endDate);
    }

    @Get('pc-build-analytics')
    async getPCBuildAnalytics(
        @Query('startDate') startDateStr: string,
        @Query('endDate') endDateStr: string,
    ) {
        const { startDate, endDate } = this.validateDates(
            startDateStr,
            endDateStr,
        );
        return this.analyticsService.getPCBuildAnalytics(startDate, endDate);
    }

    private validateDates(
        startDateStr: string,
        endDateStr: string,
    ): { startDate: Date; endDate: Date } {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return { startDate, endDate };
    }
}
