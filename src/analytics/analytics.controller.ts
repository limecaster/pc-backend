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

    // Sales Analytics
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

    // Add an alias endpoint to match frontend expectation
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

    // Basic User Behavior Analytics
    @Get('user-behavior')
    async getUserBehaviorReport(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getUserBehaviorReport(startDate, endDate);
    }

    @Get('user-cohort')
    async getUserCohortAnalysis(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getUserCohortAnalysis(startDate, endDate);
    }

    @Get('user-funnel')
    async getUserFunnelAnalysis(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
        @Query('steps') steps?: string,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }

        const funnelSteps = steps ? steps.split(',') : undefined;
        return this.analyticsService.getUserFunnelAnalysis(
            startDate,
            endDate,
            funnelSteps,
        );
    }

    @Get('devices')
    async getDeviceAnalytics(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getDeviceAnalytics(startDate, endDate);
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

    // Inventory Analytics
    @Get('inventory')
    async getInventoryReport() {
        return this.analyticsService.getInventoryReport();
    }

    // Add an alias endpoint to match frontend expectation
    @Get('inventory-report')
    async getInventoryReportAlias() {
        return this.analyticsService.getInventoryReport();
    }

    // Order Analytics
    @Get('refunds')
    async getRefundReport(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getRefundReport(startDate, endDate);
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

    // New Advanced User Behavior Analytics Endpoints
    @Get('user-journey')
    async getUserJourneyAnalysis(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getUserJourneyAnalysis(startDate, endDate);
    }

    @Get('search-analytics')
    async getSearchAnalytics(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getSearchAnalytics(startDate, endDate);
    }

    @Get('user-interests')
    async getUserInterestSegmentation(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getUserInterestSegmentation(
            startDate,
            endDate,
        );
    }

    @Get('shopping-behavior')
    async getShoppingBehaviorPatterns(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getShoppingBehaviorPatterns(
            startDate,
            endDate,
        );
    }

    @Get('discount-impact')
    async getDiscountImpactAnalysis(
        @ParseDate('startDate') startDate: Date,
        @ParseDate('endDate') endDate: Date,
    ) {
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }
        return this.analyticsService.getDiscountImpactAnalysis(
            startDate,
            endDate,
        );
    }
}
