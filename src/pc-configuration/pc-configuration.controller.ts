import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    NotFoundException,
    ForbiddenException,
    Logger,
    Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PCConfigurationService } from './pc-configuration.service';
import {
    CreatePCConfigurationDto,
    UpdatePCConfigurationDto,
} from './dto/pc-configuration.dto';

@Controller('pc-configurations')
export class PCConfigurationController {
    private readonly logger = new Logger(PCConfigurationController.name);

    constructor(
        private readonly pcConfigurationService: PCConfigurationService,
    ) {}

    @Post()
    @UseGuards(JwtAuthGuard)
    async create(@Body() createDto: CreatePCConfigurationDto, @Request() req) {
        try {
            // Add the customer ID from the authenticated user
            const customerId = req.user.id;
            this.logger.log(
                `Creating new PC configuration for customer ${customerId}`,
            );

            return await this.pcConfigurationService.create(
                customerId,
                createDto,
            );
        } catch (error) {
            this.logger.error(
                `Error creating PC configuration: ${error.message}`,
            );
            throw error;
        }
    }

    @Get()
    @UseGuards(JwtAuthGuard)
    async findAll(@Request() req) {
        try {
            // Get customer ID from authenticated user
            const customerId = req.user.id;
            this.logger.log(
                `Getting all PC configurations for customer ${customerId}`,
            );

            return await this.pcConfigurationService.findAllByCustomerId(
                customerId,
            );
        } catch (error) {
            this.logger.error(
                `Error fetching PC configurations: ${error.message}`,
            );
            throw error;
        }
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    async findOne(@Param('id') id: string, @Request() req) {
        try {
            const configuration = await this.pcConfigurationService.findOne(id);

            if (!configuration) {
                throw new NotFoundException(
                    `PC configuration with ID ${id} not found`,
                );
            }

            // Check if configuration belongs to the requesting user
            const customerId = req.user.id;
            if (configuration.customerId !== customerId) {
                throw new ForbiddenException(
                    'You do not have permission to access this configuration',
                );
            }

            return configuration;
        } catch (error) {
            this.logger.error(
                `Error fetching PC configuration ${id}: ${error.message}`,
            );
            throw error;
        }
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard)
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdatePCConfigurationDto,
        @Request() req,
    ) {
        try {
            // First check if the configuration exists and belongs to the user
            const configuration = await this.pcConfigurationService.findOne(id);

            if (!configuration) {
                throw new NotFoundException(
                    `PC configuration with ID ${id} not found`,
                );
            }

            // Check ownership
            const customerId = req.user.id;
            if (configuration.customerId !== customerId) {
                throw new ForbiddenException(
                    'You do not have permission to modify this configuration',
                );
            }

            // Update the configuration
            this.logger.log(`Updating PC configuration ${id}`);
            return await this.pcConfigurationService.update(id, updateDto);
        } catch (error) {
            this.logger.error(
                `Error updating PC configuration ${id}: ${error.message}`,
            );
            throw error;
        }
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    async remove(@Param('id') id: string, @Request() req) {
        try {
            // First check if the configuration exists and belongs to the user
            const configuration = await this.pcConfigurationService.findOne(id);

            if (!configuration) {
                throw new NotFoundException(
                    `PC configuration with ID ${id} not found`,
                );
            }

            // Check ownership
            const customerId = req.user.id;
            if (configuration.customerId !== customerId) {
                throw new ForbiddenException(
                    'You do not have permission to delete this configuration',
                );
            }

            // Delete the configuration
            this.logger.log(`Deleting PC configuration ${id}`);
            await this.pcConfigurationService.remove(id);

            return {
                success: true,
                message: 'PC configuration deleted successfully',
            };
        } catch (error) {
            this.logger.error(
                `Error deleting PC configuration ${id}: ${error.message}`,
            );
            throw error;
        }
    }
}
