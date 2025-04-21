import { Injectable, Logger } from '@nestjs/common';
import { Neo4jConfigService } from '../../config/neo4j.config';
import { UtilsService } from 'src/service/utils.service';
import { ProductSpecDto } from '../dto/product-response.dto';

@Injectable()
export class ProductSpecificationService {
    private readonly logger = new Logger(ProductSpecificationService.name);

    constructor(
        private readonly neo4jConfigService: Neo4jConfigService,
        private readonly utilsService: UtilsService,
    ) {}

    async getSpecifications(id: string): Promise<ProductSpecDto> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            const query = `
                MATCH (p {id: $id}) RETURN p AS product
            `;

            const result = await session.run(query, { id });

            if (result.records.length === 0) {
                return null;
            }

            const properties = result.records[0].get('product').properties;

            // Convert Neo4j integer objects to JavaScript numbers
            for (const key in properties) {
                if (
                    properties[key] &&
                    typeof properties[key] === 'object' &&
                    'low' in properties[key] &&
                    'high' in properties[key]
                ) {
                    properties[key] = this.utilsService.combineLowHigh(
                        properties[key].low,
                        properties[key].high,
                    );
                }
            }

            return properties as ProductSpecDto;
        } catch (error) {
            this.logger.error(
                `Error getting specifications for product ${id}: ${error.message}`,
            );
            throw new Error(`Failed to get specifications for product ${id}`);
        } finally {
            await session.close();
        }
    }

    /**
     * Get specifications for multiple products in one query
     * Prevents N+1 query problem by batching specification lookups
     */
    async getSpecificationsInBatch(
        productIds: string[],
    ): Promise<Record<string, ProductSpecDto>> {
        if (!productIds || productIds.length === 0) {
            return {};
        }

        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            const query = `
                MATCH (p)
                WHERE p.id IN $productIds
                RETURN p.id AS id, p AS product
            `;

            const result = await session.run(query, { productIds });

            // Create a map of product ID -> specifications
            const specificationsMap: Record<string, ProductSpecDto> = {};

            result.records.forEach((record) => {
                const id = record.get('id');
                const properties = record.get('product').properties;

                // Convert Neo4j integer objects to JavaScript numbers
                for (const key in properties) {
                    if (
                        properties[key] &&
                        typeof properties[key].toNumber === 'function'
                    ) {
                        properties[key] = properties[key].toNumber();
                    }
                }

                specificationsMap[id] = properties as ProductSpecDto;
            });

            return specificationsMap;
        } catch (error) {
            this.logger.error(
                `Error batch fetching specifications: ${error.message}`,
                error.stack,
            );
            throw new Error(
                `Failed to batch fetch specifications: ${error.message}`,
            );
        } finally {
            await session.close();
        }
    }

    async getAllBrands(): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (p) 
                WHERE p.manufacturer IS NOT NULL
                RETURN DISTINCT p.manufacturer AS brand
                ORDER BY brand
            `);

            return result.records.map((record) => record.get('brand'));
        } catch (error) {
            this.logger.error(`Error getting all brands: ${error.message}`);
            throw new Error('Failed to get all brands');
        } finally {
            await session.close();
        }
    }

    async getSubcategoryValues(
        category: string,
        subcategory: string,
    ): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            let query: string;

            switch (category) {
                case 'CPU':
                    switch (subcategory) {
                        case 'manufacturer':
                            query = `
                                MATCH (p:CPU) 
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'socket':
                            query = `
                                MATCH (p:CPU) 
                                WHERE p.socket IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.socket AS value
                                ORDER BY value
                            `;
                            break;
                        case 'series':
                            query = `
                                MATCH (p:CPU) 
                                WHERE p.series IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.series AS value
                                ORDER BY value
                            `;
                            break;
                        case 'microarchitecture':
                            query = `
                                MATCH (p:CPU) 
                                WHERE p.microarchitecture IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.microarchitecture AS value
                                ORDER BY value
                            `;
                            break;
                        case 'coreCount':
                            query = `
                                MATCH (p:CPU) 
                                WHERE p.coreCount IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT toString(p.coreCount) + ' nhân' AS value
                                ORDER BY value
                            `;
                            break;
                        case 'performanceCoreClock':
                            query = `
                                MATCH (p:CPU) 
                                WHERE p.performanceCoreClock IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT toString(p.performanceCoreClock) + ' GHz' AS value
                                ORDER BY value
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown CPU subcategory: ${subcategory}`,
                            );
                    }
                    break;

                case 'Motherboard':
                    switch (subcategory) {
                        case 'manufacturer':
                            query = `
                                MATCH (p:Motherboard) 
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'chipset':
                            query = `
                                MATCH (p:Motherboard) 
                                WHERE p.chipset IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.chipset AS value
                                ORDER BY value
                            `;
                            break;
                        case 'socketCPU':
                            query = `
                                MATCH (p:Motherboard) 
                                WHERE p.socketCPU IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.socketCPU AS value
                                ORDER BY value
                            `;
                            break;
                        case 'formFactor':
                            query = `
                                MATCH (p:Motherboard) 
                                WHERE p.formFactor IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.formFactor AS value
                                ORDER BY value
                            `;
                            break;
                        case 'memoryType':
                            query = `
                                MATCH (p:Motherboard) 
                                WHERE p.memoryType IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.memoryType AS value
                                ORDER BY value
                            `;
                            break;
                        case 'memoryMax':
                            query = `
                                MATCH (p:Motherboard) 
                                WHERE p.memoryMax IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.memoryMax) + ' GB' AS value, p.memoryMax AS max
                                RETURN value
                                ORDER BY p.memoryMax
                            `;
                            break;
                        case 'memorySlots':
                            query = `
                                MATCH (p:Motherboard)
                                WHERE p.memorySlots IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.memorySlots) + ' khe' AS value, p.memorySlots AS slots
                                RETURN value
                                ORDER BY slots
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown Motherboard subcategory: ${subcategory}`,
                            );
                    }
                    break;

                case 'RAM':
                    switch (subcategory) {
                        case 'manufacturer':
                            query = `
                                MATCH (p:RAM) 
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'speed':
                            query = `
                                MATCH (p:RAM) 
                                WHERE p.speed IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.speed AS value
                                ORDER BY value
                            `;
                            break;
                        case 'moduleSize':
                            query = `
                                MATCH (p:RAM) 
                                WHERE p.moduleSize IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.moduleSize) + ' GB' AS value, p.moduleSize AS size
                                RETURN value
                                ORDER BY size
                            `;
                            break;
                        case 'moduleNumber':
                            query = `
                                MATCH (p:RAM) 
                                WHERE p.moduleNumber IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.moduleNumber) + ' thanh' AS value, p.moduleNumber AS num
                                RETURN value
                                ORDER BY num
                            `;
                            break;
                        case 'color':
                            query = `
                                MATCH (p:RAM) 
                                WHERE p.color IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.color AS value
                                ORDER BY value
                            `;
                            break;
                        case 'casLatency':
                            query = `
                                MATCH (p:RAM) 
                                WHERE p.casLatency IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT 'CL' + toString(toInteger(p.casLatency)) AS value, p.casLatency AS latency
                                RETURN value
                                ORDER BY latency
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown RAM subcategory: ${subcategory}`,
                            );
                    }
                    break;

                case 'GraphicsCard':
                    switch (subcategory) {
                        case 'series':
                            query = `
                                MATCH (p:GraphicsCard) 
                                WHERE p.series IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.series AS value
                                ORDER BY value
                            `;
                            break;
                        case 'manufacturer':
                            query = `
                                MATCH (p:GraphicsCard) 
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'chipset':
                            query = `
                                MATCH (p:GraphicsCard) 
                                WHERE p.chipset IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.chipset AS value
                                ORDER BY value
                            `;
                            break;
                        case 'memory':
                            query = `
                                MATCH (p:GraphicsCard) 
                                WHERE p.memory IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.memory) + ' GB' AS value, p.memory AS mem
                                RETURN value
                                ORDER BY mem
                            `;
                            break;
                        case 'memoryType':
                            query = `
                                MATCH (p:GraphicsCard) 
                                WHERE p.memoryType IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.memoryType AS value
                                ORDER BY value
                            `;
                            break;
                        case 'cooling':
                            query = `
                                MATCH (p:GraphicsCard) 
                                WHERE p.cooling IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.cooling) + ' quạt' AS value, p.cooling AS cool
                                RETURN value
                                ORDER BY cool
                            `;
                            break;
                        case 'tdp':
                            query = `
                                MATCH (p:GraphicsCard) 
                                WHERE p.tdp IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.tdp) + ' W' AS value, p.tdp AS power
                                RETURN value
                                ORDER BY power
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown GraphicsCard subcategory: ${subcategory}`,
                            );
                    }
                    break;

                case 'InternalHardDrive':
                    switch (subcategory) {
                        case 'manufacturer':
                            query = `
                                MATCH (p:InternalHardDrive) 
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'type':
                            query = `
                                MATCH (p:InternalHardDrive) 
                                WHERE p.type IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.type AS value
                                ORDER BY value
                            `;
                            break;
                        case 'interface':
                            query = `
                                MATCH (p:InternalHardDrive) 
                                WHERE p.interface IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.interface AS value
                                ORDER BY value
                            `;
                            break;
                        case 'formFactor':
                            query = `
                                MATCH (p:InternalHardDrive) 
                                WHERE p.formFactor IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.formFactor AS value
                                ORDER BY value
                            `;
                            break;
                        case 'capacity':
                            query = `
                                MATCH (p:InternalHardDrive) 
                                WHERE p.capacity IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT 
                                    CASE 
                                        WHEN p.capacity >= 1000 THEN toString(toInteger(p.capacity/1000)) + ' TB' 
                                        ELSE toString(p.capacity) + ' GB' 
                                    END AS value, p.capacity AS cap
                                RETURN value
                                ORDER BY cap
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown InternalHardDrive subcategory: ${subcategory}`,
                            );
                    }
                    break;

                case 'PowerSupply':
                    switch (subcategory) {
                        case 'manufacturer':
                            query = `
                                MATCH (p:PowerSupply)
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'wattage':
                            query = `
                                MATCH (p:PowerSupply)
                                WHERE p.wattage IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.wattage) + ' W' AS value, p.wattage AS watts
                                RETURN value
                                ORDER BY watts
                            `;
                            break;
                        case 'efficiencyRating':
                            query = `
                                MATCH (p:PowerSupply)
                                WHERE p.efficiencyRating IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.efficiencyRating AS value
                                ORDER BY value
                            `;
                            break;
                        case 'type':
                            query = `
                                MATCH (p:PowerSupply)
                                WHERE p.type IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.type AS value
                                ORDER BY value
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown PowerSupply subcategory: ${subcategory}`,
                            );
                    }
                    break;
                case 'Case':
                    switch (subcategory) {
                        case 'manufacturer':
                            query = `
                                MATCH (p:Case)
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'type':
                            query = `
                                MATCH (p:Case)
                                WHERE p.type IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.type AS value
                                ORDER BY value
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown Case subcategory: ${subcategory}`,
                            );
                    }
                    break;
                case 'Monitor':
                    switch (subcategory) {
                        case 'manufacturer':
                            query = `
                                MATCH (p:Monitor)
                                WHERE p.manufacturer IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.manufacturer AS value
                                ORDER BY value
                            `;
                            break;
                        case 'screenSize':
                            query = `
                                MATCH (p:Monitor)
                                WHERE p.screenSize IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.screenSize) + ' inch' AS value, p.screenSize AS size
                                RETURN value
                                ORDER BY size
                            `;
                            break;
                        case 'resolution':
                            query = `
                                MATCH (p:Monitor)
                                WHERE p.resolution IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.resolution AS value
                                ORDER BY value
                            `;
                            break;
                        case 'refreshRate':
                            query = `
                                MATCH (p:Monitor)
                                WHERE p.refreshRate IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                WITH DISTINCT toString(p.refreshRate) + ' Hz' AS value, p.refreshRate AS rate
                                RETURN value
                                ORDER BY rate
                            `;
                            break;
                        case 'panelType':
                            query = `
                                MATCH (p:Monitor)
                                WHERE p.panelType IS NOT NULL AND p.price > 0 AND p.price IS NOT NULL
                                RETURN DISTINCT p.panelType AS value
                                ORDER BY value
                            `;
                            break;
                        default:
                            throw new Error(
                                `Unknown Monitor subcategory: ${subcategory}`,
                            );
                    }
                    break;
                default:
                    throw new Error(`Unknown category: ${category}`);
            }

            const result = await session.run(query);
            return result.records.map((record) => record.get('value'));
        } catch (error) {
            this.logger.error(
                `Error fetching ${subcategory} values for ${category}: ${error.message}`,
            );
            // Return empty array instead of throwing error for unknown subcategories
            return [];
        } finally {
            await session.close();
        }
    }

    /**
     * Get all specification keys available for a given product category
     * For example, CPU might have keys like: manufacturer, socket, series, etc.
     */
    async getSubcategoryKeys(category: string): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            if (!category) {
                return [];
            }

            // First try to match based on label (category)
            const query = `
                MATCH (p:${category})
                WHERE p.price > 0 AND p.price IS NOT NULL
                RETURN p
                LIMIT 1
            `;

            const result = await session.run(query);

            if (result.records.length === 0) {
                return [];
            }

            // Get the first node and extract its property keys as the spec fields
            const nodeProps = result.records[0].get('p').properties;

            // Filter out common properties that aren't specifications
            const commonProps = [
                'id',
                'price',
                'imageUrl',
                'name',
                'description',
                'category',
                'stock',
                'status',
                'stockQuantity',
                'additionalImages',
            ];

            const specKeys = Object.keys(nodeProps)
                .filter((key) => !commonProps.includes(key))
                .sort();

            return specKeys;
        } catch (error) {
            this.logger.error(
                `Error getting subcategory keys for ${category}: ${error.message}`,
                error.stack,
            );
            return []; // Return empty array on error
        } finally {
            await session.close();
        }
    }

    async getProductIdsBySubcategoryFilters(
        category: string,
        subcategoryFilters: Record<string, string[]>,
        brands?: string[],
        usePatternMatching: boolean = false,
    ): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            // Build Neo4j query with subcategory filters
            let cypher = `MATCH (p`;
            if (category) {
                cypher += `:${category}`;
            }
            cypher += `) WHERE 1=1`;

            // Add filters for each subcategory
            const params: any = {};
            Object.entries(subcategoryFilters).forEach(
                ([key, values], index) => {
                    if (values && values.length > 0) {
                        const paramName = `subcatValues${index}`;

                        // Handle numeric properties with units
                        if (
                            [
                                'coreCount',
                                'performanceCoreClock',
                                'memoryMax',
                                'moduleSize',
                                'moduleNumber',
                                'memory',
                                'cooling',
                                'tdp',
                                'capacity',
                            ].includes(key)
                        ) {
                            // Extract numeric values from formatted strings
                            const numericValues = this.extractNumericValues(
                                key,
                                values,
                            );
                            cypher += ` AND p.${key} IN $${paramName}`;
                            params[paramName] = numericValues;
                        } else if (key === 'casLatency') {
                            // Extract numbers from values like "CL16" -> 16
                            const numericValues = values.map((v) =>
                                parseInt(v.replace('CL', '')),
                            );
                            cypher += ` AND p.${key} IN $${paramName}`;
                            params[paramName] = numericValues;
                        } else {
                            // For string values, use pattern matching if requested
                            if (usePatternMatching) {
                                // Use Neo4j's pattern matching with regex
                                const conditions = values
                                    .map(
                                        (_, i) =>
                                            `toLower(toString(p.${key})) =~ toLower($${paramName}${i})`,
                                    )
                                    .join(' OR ');
                                cypher += ` AND (${conditions})`;

                                // Add each pattern as a separate parameter with proper regex formatting
                                values.forEach((value, i) => {
                                    // Remove % characters that might have been added and ensure proper regex pattern
                                    const cleanValue = value.replace(/%/g, '');
                                    params[`${paramName}${i}`] =
                                        `.*${cleanValue}.*`;
                                });
                            } else {
                                // Use exact matching - ensure values are properly formatted as strings
                                cypher += ` AND p.${key} IN $${paramName}`;
                                params[paramName] = values.map(String);
                            }
                        }
                    }
                },
            );

            // Make sure brand filter is applied correctly (manufacturer is a special case)
            if (
                brands &&
                brands.length > 0 &&
                !subcategoryFilters.manufacturer
            ) {
                cypher += ` AND p.manufacturer IN $brands`;
                params.brands = brands.map(String);
            }

            // Ensure we get distinct product IDs
            cypher += ` RETURN DISTINCT p.id AS id`;

            // Execute the query
            const result = await session.run(cypher, params);

            // Process results
            const ids = result.records.map((record) => record.get('id'));

            return ids;
        } catch (error) {
            this.logger.error(
                `Error getting product IDs by subcategory filters: ${error.message}`,
            );
            throw new Error(
                `Failed to get product IDs by subcategory filters: ${error.message}`,
            );
        } finally {
            await session.close();
        }
    }

    async getProductIdsByBrands(
        brands: string[],
        category?: string,
    ): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            const brandsParam = brands.map((brand) => `"${brand}"`).join(', ');
            const query = `
                MATCH (p)
                WHERE p.manufacturer IN [${brandsParam}]
                ${category ? 'AND $category IN labels(p)' : ''}
                RETURN p.id AS id
            `;

            const result = await session.run(query, { category });
            return result.records.map((record) => record.get('id'));
        } catch (error) {
            this.logger.error(
                `Error getting product IDs by brands: ${error.message}`,
            );
            throw new Error('Failed to get product IDs by brands');
        } finally {
            await session.close();
        }
    }

    /**
     * Get all product IDs in a specific category
     * @param category The category to get products for
     * @returns Array of product IDs in the category
     */
    async getProductsByCategory(category: string): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            const result = await session.run(
                `MATCH (p:${category}) RETURN p.id as id`,
                { category },
            );

            return result.records.map((record) => record.get('id'));
        } catch (error) {
            this.logger.error(
                `Error getting products in category ${category}: ${error.message}`,
            );
            throw error;
        } finally {
            await session.close();
        }
    }

    // ADMIN: Get all unique values for a given specification key in a category
    async getSpecificationValuesForAdmin(category: string, specKey: string): Promise<string[]> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();

        try {
            const query = `
                MATCH (p:${category})
                WHERE p.${specKey} IS NOT NULL
                RETURN DISTINCT p.${specKey} AS value
                ORDER BY value
            `;
            const result = await session.run(query);
            return result.records.map(record => record.get('value'));
        } catch (error) {
            this.logger.error(
                `Error fetching admin spec values for ${specKey} in ${category}: ${error.message}`,
            );
            throw new Error(`Failed to get admin spec values for ${specKey}`);
        } finally {
            await session.close();
        }
    }

    // Helper method to extract numeric values from formatted strings
    private extractNumericValues(key: string, values: string[]): number[] {
        switch (key) {
            case 'coreCount':
                // Extract numbers from values like "8 nhân" -> 8
                return values.map((v) => parseInt(v.split(' ')[0]));

            case 'performanceCoreClock':
                // Extract numbers from values like "3.5 GHz" -> 3.5
                return values.map((v) => parseFloat(v.split(' ')[0]));

            case 'memoryMax':
            case 'moduleSize':
            case 'memory':
                // Extract numbers from values like "16 GB" -> 16
                return values.map((v) => parseInt(v.split(' ')[0]));

            case 'moduleNumber':
                // Extract numbers from values like "2 thanh" -> 2
                return values.map((v) => parseInt(v.split(' ')[0]));

            case 'cooling':
                // Extract numbers from values like "3 quạt" -> 3
                return values.map((v) => parseInt(v.split(' ')[0]));

            case 'tdp':
                // Extract numbers from values like "115 W" -> 115
                return values.map((v) => parseInt(v.split(' ')[0]));

            case 'capacity':
                // Handle both GB and TB values
                return values.map((v) => {
                    const parts = v.split(' ');
                    if (parts[1] === 'TB') {
                        return parseInt(parts[0]) * 1000; // Convert TB to GB
                    } else {
                        return parseInt(parts[0]); // Already in GB
                    }
                });

            default:
                return values.map((v) => Number(v));
        }
    }
}
