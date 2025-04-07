import { Injectable, Logger } from '@nestjs/common';
import { SalesAnalyticsService } from './services/sales-analytics.service';
import { UserBehaviorAnalyticsService } from './services/user-behavior-analytics.service';
import { InventoryAnalyticsService } from './services/inventory-analytics.service';
import { OrderAnalyticsService } from './services/order-analytics.service';

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger(AnalyticsService.name);

    constructor(
        private salesAnalyticsService: SalesAnalyticsService,
        private userBehaviorAnalyticsService: UserBehaviorAnalyticsService,
        private inventoryAnalyticsService: InventoryAnalyticsService,
        private orderAnalyticsService: OrderAnalyticsService,
    ) {}

    // Sales Analytics
    async getSalesReport(startDate: Date, endDate: Date) {
        return this.salesAnalyticsService.getSalesReport(startDate, endDate);
    }

    async getBestSellingProducts(startDate: Date, endDate: Date) {
        return this.salesAnalyticsService.getBestSellingProducts(
            startDate,
            endDate,
        );
    }

    async getBestSellingCategories(startDate: Date, endDate: Date) {
        return this.salesAnalyticsService.getBestSellingCategories(
            startDate,
            endDate,
        );
    }

    // User Behavior Analytics
    async getUserBehaviorReport(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getUserBehaviorReport(
            startDate,
            endDate,
        );
    }

    async getUserEngagementMetrics(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getUserEngagementMetrics(
            startDate,
            endDate,
        );
    }

    async getMostViewedProducts(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getMostViewedProducts(
            startDate,
            endDate,
        );
    }

    async getConversionRates(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getConversionRates(
            startDate,
            endDate,
        );
    }

    // New Advanced User Behavior Analytics Methods
    async getUserJourneyAnalysis(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getUserJourneyAnalysis(
            startDate,
            endDate,
        );
    }

    async getSearchAnalytics(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getSearchAnalytics(
            startDate,
            endDate,
        );
    }

    async getUserInterestSegmentation(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getUserInterestSegmentation(
            startDate,
            endDate,
        );
    }

    async getShoppingBehaviorPatterns(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getShoppingBehaviorPatterns(
            startDate,
            endDate,
        );
    }

    async getDiscountImpactAnalysis(startDate: Date, endDate: Date) {
        return this.userBehaviorAnalyticsService.getDiscountImpactAnalysis(
            startDate,
            endDate,
        );
    }

    // Inventory Analytics
    async getInventoryReport() {
        return this.inventoryAnalyticsService.getInventoryReport();
    }

    async getLowStockProducts(page = 1, limit = 10, search = '') {
        return this.inventoryAnalyticsService.getLowStockProducts(page, limit, search);
    }

    async getOutOfStockProducts(page = 1, limit = 10, search = '') {
        return this.inventoryAnalyticsService.getOutOfStockProducts(page, limit, search);
    }

    async getProductCategories() {
        return this.inventoryAnalyticsService.getProductCategories();
    }

    // Order Analytics
    async getRefundReport(startDate: Date, endDate: Date) {
        return this.orderAnalyticsService.getRefundReport(startDate, endDate);
    }

    async getAbandonedCarts(startDate: Date, endDate: Date) {
        return this.orderAnalyticsService.getAbandonedCarts(startDate, endDate);
    }
}
