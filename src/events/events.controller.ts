import { Controller, Post, Body, Get, Param, UseGuards, Req, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, ProductClickEventDto } from './dto/create-event.dto';
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
    async trackEvent(@Body() createEventDto: CreateEventDto, @Req() req: Request) {
        try {
            this.logger.log(`Received event tracking request: ${createEventDto.eventType}`);
            
            // Capture IP address
            createEventDto.ipAddress = req.ip;
            
            // Send to Kafka
            await this.producerService.produce({
                topic: 'user-behavior',
                messages: [
                    { value: JSON.stringify(createEventDto) },
                ],
            });
            
            return { success: true, message: 'Event tracking request received' };
        } catch (error) {
            this.logger.error(`Error tracking event: ${error.message}`, error.stack);
            throw new HttpException('Failed to track event', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('product-click')
    async trackProductClick(@Body() productClickDto: ProductClickEventDto, @Req() req: Request) {
        try {
            this.logger.log(`Received product click tracking for product: ${productClickDto.productId}`);
            
            // Capture IP address
            productClickDto.ipAddress = req.ip;
            
            // Log customerId for debugging
            if (productClickDto.customerId) {
                this.logger.debug(`Customer ID: ${productClickDto.customerId} (${typeof productClickDto.customerId})`);
            }
            
            // Log the entire payload for debugging
            this.logger.debug(`Product click payload: ${JSON.stringify(productClickDto)}`);
            
            // Send to Kafka
            await this.producerService.produce({
                topic: 'user-behavior',
                messages: [
                    { value: JSON.stringify(productClickDto) },
                ],
            });
            
            return { success: true, message: 'Product click tracking request received' };
        } catch (error) {
            this.logger.error(`Error tracking product click: ${error.message}`, error.stack);
            throw new HttpException('Failed to track product click', HttpStatus.INTERNAL_SERVER_ERROR);
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
}
