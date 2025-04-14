import {
    Controller,
    Post,
    Body,
    Get,
    Param,
    UseGuards,
    Req,
    Logger,
    HttpException,
    HttpStatus,
    Query,
} from '@nestjs/common';
import { EventsService } from './events.service';
import {
    CreateEventDto,
    ProductClickEventDto,
    DiscountUsageEventDto,
} from './dto/create-event.dto';
import { ProducerService } from './kafka/producer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('events')
export class EventsController {
    private readonly logger = new Logger(EventsController.name);

    constructor(
        private readonly eventsService: EventsService,
        private readonly producerService: ProducerService,
    ) {}

    @Post('track')
    async trackEvent(
        @Body() createEventDto: CreateEventDto,
        @Req() req: Request,
    ) {
        try {
            // Capture IP address
            createEventDto.ipAddress = req.ip;

            // Send to Kafka
            await this.producerService.produce({
                topic: 'user-behavior',
                messages: [{ value: JSON.stringify(createEventDto) }],
            });

            return {
                success: true,
                message: 'Event tracking request received',
                eventType: createEventDto.eventType,
                sessionId: createEventDto.sessionId,
            };
        } catch (error) {
            this.logger.error(
                `Error tracking event: ${error.message}`,
                error.stack,
            );
            throw new HttpException(
                'Failed to track event',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('product-click')
    async trackProductClick(
        @Body() productClickDto: ProductClickEventDto,
        @Req() req: Request,
    ) {
        try {
            // Capture IP address
            productClickDto.ipAddress = req.ip;

            // Send to Kafka
            await this.producerService.produce({
                topic: 'user-behavior',
                messages: [{ value: JSON.stringify(productClickDto) }],
            });

            return {
                success: true,
                message: 'Product click tracking request received',
            };
        } catch (error) {
            this.logger.error(
                `Error tracking product click: ${error.message}`,
                error.stack,
            );
            throw new HttpException(
                'Failed to track product click',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('discount-usage')
    async trackDiscountUsage(
        @Body() discountUsageDto: DiscountUsageEventDto,
        @Req() req: Request,
    ) {
        try {
            // Add IP address to event data
            const ipAddress = req.ip || req.connection.remoteAddress;

            // Track the discount usage event
            const event = await this.eventsService.createDiscountUsageEvent({
                ...discountUsageDto,
                ipAddress,
            });

            return { success: true, eventId: event.id };
        } catch (error) {
            console.error('Error tracking discount usage:', error);
            return { success: false, message: error.message };
        }
    }

    @Post('auth-event')
    async trackAuthEvent(
        @Body() authEventDto: any,
        @Req() req: Request,
    ) {
        try {
            // Capture IP address
            authEventDto.ipAddress = req.ip;

            // Send to Kafka
            await this.producerService.produce({
                topic: 'auth-events',
                messages: [{ value: JSON.stringify(authEventDto) }],
            });

            return {
                success: true,
                message: 'Authentication event tracking request received',
                eventType: authEventDto.eventType,
            };
        } catch (error) {
            this.logger.error(
                `Error tracking authentication event: ${error.message}`,
                error.stack,
            );
            throw new HttpException(
                'Failed to track authentication event',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('customer/:id')
    async getCustomerEvents(@Param('id') id: string) {
        return this.eventsService.getEventsByCustomerId(parseInt(id));
    }

    @Get('session/:sessionId')
    async getSessionEvents(@Param('sessionId') sessionId: string) {
        return this.eventsService.getEventsBySessionId(sessionId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('type/:eventType')
    async getEventsByType(@Param('eventType') eventType: string) {
        return this.eventsService.getEventsByType(eventType);
    }

    @UseGuards(JwtAuthGuard)
    @Get('discount-analytics')
    async getDiscountAnalytics(
        @Query()
        query: {
            startDate?: string;
            endDate?: string;
            discountId?: string;
        },
    ) {
        try {
            const analytics =
                await this.eventsService.getDiscountAnalytics(query);
            return { success: true, data: analytics };
        } catch (error) {
            console.error('Error fetching discount analytics:', error);
            return { success: false, message: error.message };
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('product-discount-usage')
    async getProductDiscountUsage(
        @Query() query: { productId?: string; discountId?: string },
    ) {
        try {
            const usageData =
                await this.eventsService.getProductDiscountUsage(query);
            return { success: true, data: usageData };
        } catch (error) {
            console.error('Error fetching product discount usage:', error);
            return { success: false, message: error.message };
        }
    }
}
