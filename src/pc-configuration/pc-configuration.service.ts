import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PCConfiguration } from './entities/pc-configuration.entity';
import {
    CreatePCConfigurationDto,
    UpdatePCConfigurationDto,
} from './dto/pc-configuration.dto';

@Injectable()
export class PCConfigurationService {
    private readonly logger = new Logger(PCConfigurationService.name);

    constructor(
        @InjectRepository(PCConfiguration)
        private readonly pcConfigurationRepository: Repository<PCConfiguration>,
    ) {}

    async create(
        customerId: number,
        createDto: CreatePCConfigurationDto,
    ): Promise<PCConfiguration> {
        try {
            const configuration = new PCConfiguration();
            configuration.customerId = customerId;
            configuration.name = createDto.name;
            configuration.purpose = createDto.purpose;
            configuration.products = createDto.products;
            configuration.totalPrice = createDto.totalPrice;
            configuration.wattage = createDto.wattage;
            configuration.status = 'active';

            const savedConfiguration =
                await this.pcConfigurationRepository.save(configuration);
            this.logger.log(
                `Created PC configuration with ID: ${savedConfiguration.id}`,
            );
            return savedConfiguration;
        } catch (error) {
            this.logger.error(
                `Error creating PC configuration: ${error.message}`,
            );
            throw error;
        }
    }

    async findAllByCustomerId(customerId: number): Promise<PCConfiguration[]> {
        try {
            const configurations = await this.pcConfigurationRepository.find({
                where: { customerId, status: 'active' },
                order: { updatedAt: 'DESC' },
            });

            this.logger.log(
                `Found ${configurations.length} PC configurations for customer ${customerId}`,
            );
            return configurations;
        } catch (error) {
            this.logger.error(
                `Error finding PC configurations for customer ${customerId}: ${error.message}`,
            );
            throw error;
        }
    }

    async findOne(id: string): Promise<PCConfiguration> {
        try {
            const configuration = await this.pcConfigurationRepository.findOne({
                where: { id: parseInt(id), status: 'active' },
            });

            if (!configuration) {
                this.logger.warn(`PC configuration with ID ${id} not found`);
                return null;
            }

            this.logger.log(`Found PC configuration with ID ${id}`);
            return configuration;
        } catch (error) {
            this.logger.error(
                `Error finding PC configuration ${id}: ${error.message}`,
            );
            throw error;
        }
    }

    async update(
        id: string,
        updateDto: UpdatePCConfigurationDto,
    ): Promise<PCConfiguration> {
        try {
            const configuration = await this.findOne(id);

            if (!configuration) {
                throw new NotFoundException(
                    `PC configuration with ID ${id} not found`,
                );
            }

            // Update fields
            if (updateDto.name !== undefined) {
                configuration.name = updateDto.name;
            }

            if (updateDto.purpose !== undefined) {
                configuration.purpose = updateDto.purpose;
            }

            if (updateDto.products !== undefined) {
                configuration.products = updateDto.products;
            }

            if (updateDto.totalPrice !== undefined) {
                configuration.totalPrice = updateDto.totalPrice;
            }

            if (updateDto.wattage !== undefined) {
                configuration.wattage = updateDto.wattage;
            }

            const updatedConfiguration =
                await this.pcConfigurationRepository.save(configuration);
            this.logger.log(`Updated PC configuration with ID ${id}`);
            return updatedConfiguration;
        } catch (error) {
            this.logger.error(
                `Error updating PC configuration ${id}: ${error.message}`,
            );
            throw error;
        }
    }

    async remove(id: string): Promise<void> {
        try {
            const configuration = await this.findOne(id);

            if (!configuration) {
                throw new NotFoundException(
                    `PC configuration with ID ${id} not found`,
                );
            }

            // Soft delete by setting status to 'deleted'
            configuration.status = 'deleted';
            await this.pcConfigurationRepository.save(configuration);

            this.logger.log(`Deleted PC configuration with ID ${id}`);
        } catch (error) {
            this.logger.error(
                `Error removing PC configuration ${id}: ${error.message}`,
            );
            throw error;
        }
    }
}
