import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PCConfiguration } from './entities/pc-configuration.entity';
import { PCConfigurationProduct } from './entities/pc-configuration-product.entity';
import {
    CreatePCConfigurationDto,
    UpdatePCConfigurationDto,
} from './dto/pc-configuration.dto';

// Component type standardization - keep this in sync with frontend
const COMPONENT_TYPE_MAPPING: Record<string, string> = {
    // English standard names
    'CPU': 'CPU',
    'CPUCooler': 'CPUCooler',
    'CPU Cooler': 'CPUCooler',
    'Motherboard': 'Motherboard',
    'RAM': 'RAM',
    'Memory': 'RAM',
    'GraphicsCard': 'GraphicsCard',
    'Graphics Card': 'GraphicsCard',
    'GPU': 'GraphicsCard',
    'Storage': 'InternalHardDrive',
    'SSD': 'InternalHardDrive',
    'HDD': 'InternalHardDrive',
    'Case': 'Case',
    'PowerSupply': 'PowerSupply',
    'Power Supply': 'PowerSupply',
    'PSU': 'PowerSupply',
    'Monitor': 'Monitor',
    'Keyboard': 'Keyboard',
    'Mouse': 'Mouse',
    
    // Vietnamese names
    'Bo mạch chủ': 'Motherboard',
    'Tản nhiệt CPU': 'CPUCooler',
    'Card đồ họa': 'GraphicsCard',
    'Bộ nhớ': 'RAM',
    'Lưu trữ': 'InternalHardDrive',
    'Ổ cứng': 'InternalHardDrive',
    'Ổ SSD': 'InternalHardDrive',
    'Vỏ case': 'Case',
    'Nguồn': 'PowerSupply',
    'Bộ nguồn': 'PowerSupply',
    'Quạt tản nhiệt': 'CPUCooler',
};

function standardizeComponentType(type: string): string {
    if (!type) return ''; // Return empty string for null/undefined
    
    // Special case for SSD/HDD - they are both InternalHardDrive in the database
    // but we want to differentiate them by type property
    if (type === 'SSD' || type === 'HDD') {
        return 'InternalHardDrive';
    }
    
    return COMPONENT_TYPE_MAPPING[type] || type;
}

@Injectable()
export class PCConfigurationService {
    private readonly logger = new Logger(PCConfigurationService.name);

    constructor(
        @InjectRepository(PCConfiguration)
        private readonly pcConfigurationRepository: Repository<PCConfiguration>,
        @InjectRepository(PCConfigurationProduct)
        private readonly pcConfigProductRepository: Repository<PCConfigurationProduct>,
        private dataSource: DataSource,
    ) {}

    async create(
        customerId: number,
        createDto: CreatePCConfigurationDto,
    ): Promise<PCConfiguration> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
       
            // First create the PC configuration
            const configuration = new PCConfiguration();
            configuration.customerId = customerId;
            configuration.name = createDto.name;
            configuration.purpose = createDto.purpose;
            configuration.totalPrice = createDto.totalPrice;
            configuration.wattage = createDto.wattage;
            configuration.status = 'active';
            
            // Save the configuration first to get an ID
            const savedConfiguration = await queryRunner.manager.save(configuration);
            
            // Then create product associations with safety checks
            if (createDto.products && Array.isArray(createDto.products) && createDto.products.length > 0) {
                const productEntities = createDto.products
                    .filter(product => product && product.productId) // Ensure valid products only
                    .map(product => {
                        const configProduct = new PCConfigurationProduct();
                        configProduct.configurationId = savedConfiguration.id;
                        configProduct.productId = product.productId;
                        
                        // Standardize component type with safety check
                        configProduct.componentType = standardizeComponentType(product.componentType);
                        
                        configProduct.category = product.category || '';
                        configProduct.name = product.name || '';
                        
                       
                
                        configProduct.price = typeof product.price === 'number' ? product.price : 0;

                        
                        // Store original component type in details if it's different
                        const details = product.details || {};
                        
                        // Special handling for storage components - ensure type is preserved
                        if (configProduct.componentType === 'InternalHardDrive') {
                            // Check if it's SSD or HDD from the component type or from details
                            if (product.componentType === 'SSD' || details.type === 'SSD' || details.storageType === 'SSD') {
                                details.type = 'SSD';
                                details.storageType = 'SSD';
                            } else if (product.componentType === 'HDD' || details.type === 'HDD' || details.storageType === 'HDD') {
                                details.type = 'HDD';
                                details.storageType = 'HDD';
                            }
                        }
                        
                        // Preserve original component type
                        if (product.componentType !== configProduct.componentType) {
                            details.originalComponentType = product.componentType;
                        }
                        
                        configProduct.details = details;
                        return configProduct;
                    });
                
                if (productEntities.length > 0) {
                    await queryRunner.manager.save(PCConfigurationProduct, productEntities);
                }
            }
            
            await queryRunner.commitTransaction();
            
            // Fetch the complete configuration with products
            return this.findOne(savedConfiguration.id.toString());
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Error creating PC configuration: ${error.message}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async findAllByCustomerId(customerId: number): Promise<PCConfiguration[]> {
        try {
            const configurations = await this.pcConfigurationRepository.find({
                where: { customerId, status: 'active' },
                relations: ['products'],
                order: { updatedAt: 'DESC' },
            });
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
                relations: ['products'],
            });

            if (!configuration) {
                return null;
            }

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
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Find the configuration first
            const configuration = await this.findOne(id);
            if (!configuration) {
                throw new NotFoundException(`PC configuration with ID ${id} not found`);
            }

            // Update basic configuration properties
            if (updateDto.name !== undefined) configuration.name = updateDto.name;
            if (updateDto.purpose !== undefined) configuration.purpose = updateDto.purpose;
            if (updateDto.totalPrice !== undefined) configuration.totalPrice = updateDto.totalPrice;
            if (updateDto.wattage !== undefined) configuration.wattage = updateDto.wattage;

            // Save the updated configuration
            await queryRunner.manager.save(configuration);

            // Update products if provided
            if (updateDto.products !== undefined) {
                // Delete existing products for this configuration
                await queryRunner.manager.delete(PCConfigurationProduct, { configurationId: parseInt(id) });
                
                // Add the new products
                if (updateDto.products.length > 0) {
                    const productEntities = updateDto.products
                        .filter(product => product && product.productId) // Ensure valid products only
                        .map(product => {
                            const configProduct = new PCConfigurationProduct();
                            configProduct.configurationId = parseInt(id);
                            configProduct.productId = product.productId;
                            
                            // Standardize component type with safety check
                            configProduct.componentType = standardizeComponentType(product.componentType);
                            
                            configProduct.category = product.category || '';
                            configProduct.name = product.name || '';
                            configProduct.price = product.price || 0;
                            
                            // Store original component type in details if it's different
                            const details = product.details || {};
                            
                            // Special handling for storage components - ensure type is preserved
                            if (configProduct.componentType === 'InternalHardDrive') {
                                // Check if it's SSD or HDD from the component type or from details
                                if (product.componentType === 'SSD' || details.type === 'SSD' || details.storageType === 'SSD') {
                                    details.type = 'SSD';
                                    details.storageType = 'SSD';
                                } else if (product.componentType === 'HDD' || details.type === 'HDD' || details.storageType === 'HDD') {
                                    details.type = 'HDD';
                                    details.storageType = 'HDD';
                                }
                            }
                            
                            if (product.componentType !== configProduct.componentType) {
                                details.originalComponentType = product.componentType;
                            }
                            
                            configProduct.details = details;
                            return configProduct;
                        });
                    
                    if (productEntities.length > 0) {
                        await queryRunner.manager.save(PCConfigurationProduct, productEntities);
                    }
                }
            }

            await queryRunner.commitTransaction();
            
            // Fetch and return the updated configuration
            return this.findOne(id);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Error updating PC configuration ${id}: ${error.message}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async remove(id: string): Promise<void> {
        try {
            const configuration = await this.findOne(id);
            if (!configuration) {
                throw new NotFoundException(`PC configuration with ID ${id} not found`);
            }

            // Soft delete by setting status to 'deleted'
            configuration.status = 'deleted';
            await this.pcConfigurationRepository.save(configuration);
        } catch (error) {
            this.logger.error(`Error removing PC configuration ${id}: ${error.message}`);
            throw error;
        }
    }
}
