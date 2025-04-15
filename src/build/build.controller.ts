import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ManualBuildService } from '../build/manual-build.service';
import { AutoBuildService } from '../build/auto-build.service';

@Controller('build')
export class BuildController {
    constructor(
        private readonly manualBuildService: ManualBuildService,
        private readonly autoBuildService: AutoBuildService,
    ) {}

    private mappingFrontendLabelToNeo4jLabel = {
        CPU: ['CPU'],
        'Bo mạch chủ': ['Motherboard'],
        RAM: ['RAM'],
        HDD: ['InternalHardDrive'],
        SSD: ['InternalHardDrive'],
        'Card đồ họa': ['GraphicsCard'],
        Nguồn: ['PowerSupply'],
        'Vỏ case': ['Case'],
        'Quạt tản nhiệt': ['CPUCooler'],
        'Màn hình': ['Monitor'],
        'Bàn phím': ['Keyboard'],
        Chuột: ['Mouse'],
        'Card mạng không dây': ['WiFiCard'],
        'Card mạng có dây': ['WiredNetworkCard'],
        'Kem tản nhiệt': ['ThermalPaste'],

        Motherboard: ['Motherboard'],
        GraphicsCard: ['GraphicsCard'],
        PowerSupply: ['PowerSupply'],
        Case: ['Case'],
        CPUCooler: ['CPUCooler'],
        Monitor: ['Monitor'],
        Keyboard: ['Keyboard'],
        Mouse: ['Mouse'],
        WiFiCard: ['WiFiCard'],
        WiredNetworkCard: ['WiredNetworkCard'],
        ThermalPaste: ['ThermalPaste'],
        InternalHardDrive: ['InternalHardDrive'],
    };

    @Get('manual-build/compatible-parts')
    async getSpecificPartTypeCompatibleWithSelectedParts(
        @Query('selectedParts') selectedParts: string,
        @Query('targetLabel') targetLabel: string,
        @Query('page') page: string,
        @Query('limit') limit: string,
        @Query('search') searchTerm: string,
        @Query('sort') sortOption: 'name' | 'price-asc' | 'price-desc',
    ) {
        try {
            const parsedSelectedParts = this.parseSelectedParts(selectedParts);

            if (targetLabel.length === 0) {
                throw new Error(`Invalid target label: ${targetLabel}`);
            }

            const pageNumber = parseInt(page, 10) || 1;
            const pageSize = parseInt(limit, 10) || 10;

            // Get compatible parts with SSD/HDD specific filtering
            const compatibleParts =
                await this.manualBuildService.getSpecificPartTypeCompatibleWithSelectedParts(
                    parsedSelectedParts,
                    targetLabel,
                    searchTerm,
                    sortOption,
                );

            // Handle pagination on the filtered results
            const startIndex = (pageNumber - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const items = compatibleParts.slice(startIndex, endIndex);
            const totalPages =
                Math.ceil(compatibleParts.length / pageSize) || 1; // Ensure at least 1 page

            return {
                items,
                totalPages,
                totalItems: compatibleParts.length,
            };
        } catch (error) {
            console.error('Error fetching compatible parts:', error);
            throw new Error('Failed to fetch compatible parts');
        }
    }

    @Post('auto-build')
    async autoBuild(
        @Body('userInput') userInput: string,
        @Body('userId') userId?: string
    ) {
        //console.log(await this.autoBuildService.autoBuildAllOptions(userInput));
        //const result = await this.autoBuildService.autoBuildAllOptions(userInput);
        const result2 =
            await this.autoBuildService.getAllPCConfigurations(userInput, userId);

        return result2;
    }

    @Post('single-auto-build')
    async singleAutoBuild(@Body('userInput') userInput: string) {
        const result =
            await this.autoBuildService.getSinglePCConfiguration(userInput);

        return result;
    }

    private parseSelectedParts(
        selectedParts: string | { label: string }[],
    ): any[] {
        if (!selectedParts) {
            return [];
        }
        if (typeof selectedParts === 'string') {
            try {
                const parsedSelectedParts: { label: string }[] =
                    JSON.parse(selectedParts);
                return parsedSelectedParts.map((part) => {
                    const neo4jLabels =
                        this.mappingFrontendLabelToNeo4jLabel[part.label];
                    return { ...part, neo4jLabels };
                });
            } catch (error) {
                console.log(error);
                throw new Error('Invalid JSON format for selectedParts');
            }
        } else {
            return selectedParts.map((part) => {
                const neo4jLabels =
                    this.mappingFrontendLabelToNeo4jLabel[part.label];
                return { ...part, neo4jLabels };
            });
        }
    }
}
