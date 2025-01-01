import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ManualBuildService } from '../service/manual-build.service';
import { AutoBuildService } from '../service/auto-build.service';

@Controller('build')
export class BuildController {
  constructor(
    private readonly manualBuildService: ManualBuildService,
    private readonly autoBuildService: AutoBuildService,
  ) {}

  private mappingFrontendLabelToNeo4jLabel = 
  {
    "CPU": ["CPU"],
    "Bo mạch chủ": ["Motherboard"],
    "RAM": ["RAM"],
    "HDD": ["InternalHardDrive"],
    "SSD": ["InternalHardDrive"],
    "Card đồ họa": ["GraphicsCard"],
    "Nguồn": ["PowerSupply"],
    "Vỏ case": ["Case"],
    "Quạt tản nhiệt": ["CPUCooler"],
    "Màn hình": ["Monitor"],
    "Thiết bị ngoại vi": ["Keyboard", "Mouse", "Speaker"],
    "Card mở rộng": ["WiredNetworkCard", "WiFiCard"],
    "Phụ kiện khác": ["ThermalPaste"],
  }
  
  @Get()
  async findCompatibleParts(
    @Query('name') name: string,
    @Query('otherName') otherPartTypeName: string,
  ) {
    return this.manualBuildService.findCompatibleParts(name, otherPartTypeName);
  }

  @Get('label')
  async getCompatiblePartsByLabel(
    @Query('name') name: string,
    @Query('label') label: string,
  ) {
    return this.manualBuildService.getCompatiblePartsByLabel(name, label);
  }

  @Get('check-compatibility/:newPartLabel/:newPartName')
  async checkCompatibilityAcrossLabels(
    @Param('newPartLabel') newPartLabel: string,
    @Param('newPartName') newPartName: string,
    @Query('selectedParts') selectedParts: string,
  ) {
    const parsedSelectedParts = this.parseSelectedParts(JSON.parse(selectedParts));
    return this.manualBuildService.checkCompatibilityAcrossLabels(
      newPartName,
      newPartLabel,
      parsedSelectedParts,
    );
  }

  @Get('manual-build/compatible-parts')
  async getSpecificPartTypeCompatibleWithSelectedParts(
    @Query('selectedParts') selectedParts: string,
    @Query('targetLabel') targetLabel: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    try {
      const parsedSelectedParts = this.parseSelectedParts(selectedParts);
      const targetLabels = this.mappingFrontendLabelToNeo4jLabel[targetLabel] || [];
      
      if (targetLabels.length === 0) {
        throw new Error(`Invalid target label: ${targetLabel}`);
      }
  
      const pageNumber = parseInt(page, 10) || 1;
      const pageSize = parseInt(limit, 10) || 10;
  
      const { items, totalItems } = await this.manualBuildService.findAllPartsByLabelsPaginated(targetLabels, pageNumber, pageSize);
      const compatibleParts = [];
      for (const part of items) {
        const isCompatible = await this.manualBuildService.checkPartCompatibilityWithSelected(
          part.name,
          targetLabels,
          parsedSelectedParts,
        );
        if (isCompatible) {
          compatibleParts.push(part);
        }
      }
  
      const totalPages = Math.ceil(totalItems / pageSize);
  
      console.log("Total Pages:", totalPages);
  
      return { items: compatibleParts, totalPages };
    } catch (error) {
      console.error('Error fetching compatible parts:', error);
      throw new Error('Failed to fetch compatible parts');
    }
  }

  @Post('auto-build')
  async autoBuild(@Body('userInput') userInput: string) {
    //console.log(await this.autoBuildService.autoBuildAllOptions(userInput));
    const result = await this.autoBuildService.autoBuildAllOptions(userInput);
    
    return result;
  }

  private parseSelectedParts(selectedParts: string | { label: string }[]): any[] {
    if (!selectedParts) {
      return [];
    }
    if (typeof selectedParts === 'string') {
      try {
        const parsedSelectedParts: { label: string }[] = JSON.parse(selectedParts);
        return parsedSelectedParts.map((part) => {
          const neo4jLabels = this.mappingFrontendLabelToNeo4jLabel[part.label];
          return { ...part, neo4jLabels };
        });
      } catch (error) {
        console.log(error);
        throw new Error('Invalid JSON format for selectedParts');
      }
    } else {
      return selectedParts.map((part) => {
        const neo4jLabels = this.mappingFrontendLabelToNeo4jLabel[part.label];
        return { ...part, neo4jLabels };
      });
    }
  }
}
