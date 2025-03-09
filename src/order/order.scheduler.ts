import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from './order.service';

@Injectable()
export class OrderScheduler {
    private readonly logger = new Logger(OrderScheduler.name);

    constructor(private readonly orderService: OrderService) {}

    // Run once a day at midnight
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleAutomaticDeliveryStatus() {
        this.logger.log('Running automatic order status updates');
        try {
            // Update shipping orders older than 3 days to delivered
            await this.orderService.updateShippingOrdersToDelivered(3);
        } catch (error) {
            this.logger.error(
                `Error updating order statuses: ${error.message}`,
                error.stack,
            );
        }
    }
}
