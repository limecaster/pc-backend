import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
        // Replace generic categories with specific ones
        'Bàn phím': ['Keyboard'],
        Chuột: ['Mouse'],
        'Card mạng không dây': ['WiFiCard'],
        'Card mạng có dây': ['WiredNetworkCard'],
        'Kem tản nhiệt': ['ThermalPaste'],
        // Remove these generic categories
        // 'Thiết bị ngoại vi': ['Keyboard', 'Mouse', 'Speaker'],
        // 'Card mở rộng': ['WiredNetworkCard', 'WiFiCard'],
        // 'Phụ kiện khác': ['ThermalPaste'],
    };

    // @Get()
    // async findCompatibleParts(
    //   @Query('name') name: string,
    //   @Query('otherName') otherPartTypeName: string,
    // ) {
    //   return this.manualBuildService.findCompatibleParts(name, otherPartTypeName);
    // }

    // @Get('label')
    // async getCompatiblePartsByLabel(
    //   @Query('name') name: string,
    //   @Query('label') label: string,
    // ) {
    //   return this.manualBuildService.getCompatiblePartsByLabel(name, label);
    // }

    // @Get('check-compatibility/:newPartLabel/:newPartName')
    // async checkCompatibilityAcrossLabels(
    //   @Param('newPartLabel') newPartLabel: string,
    //   @Param('newPartName') newPartName: string,
    //   @Query('selectedParts') selectedParts: string,
    // ) {
    //   const parsedSelectedParts = this.parseSelectedParts(JSON.parse(selectedParts));
    //   return this.manualBuildService.checkCompatibilityAcrossLabels(
    //     newPartName,
    //     newPartLabel,
    //     parsedSelectedParts,
    //   );
    // }

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
            const targetLabels =
                this.mappingFrontendLabelToNeo4jLabel[targetLabel] || [];

            if (targetLabels.length === 0) {
                throw new Error(`Invalid target label: ${targetLabel}`);
            }

            const pageNumber = parseInt(page, 10) || 1;
            const pageSize = parseInt(limit, 10) || 10;

            // Always get compatible parts with filtering first
            const compatibleParts =
                await this.manualBuildService.getSpecificPartTypeCompatibleWithSelectedParts(
                    parsedSelectedParts,
                    targetLabels,
                    searchTerm,
                    sortOption,
                );

            // Then handle pagination on the already filtered results
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
    async autoBuild(@Body('userInput') userInput: string) {
        //console.log(await this.autoBuildService.autoBuildAllOptions(userInput));
        //const result = await this.autoBuildService.autoBuildAllOptions(userInput);
        const result2 =
            await this.autoBuildService.getAllPCConfigurations(userInput);

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
