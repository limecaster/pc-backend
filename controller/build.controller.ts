import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ManualBuildService } from '../service/manual-build.service';
import { AutoBuildService } from '../service/auto-build.service';

@Controller('build')
export class BuildController {
  constructor(
    private readonly manualBuildService: ManualBuildService,
    private readonly autoBuildService: AutoBuildService,
  ) {}

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
    @Query('selectedParts') selectedParts: string[],
  ) {
    const parsedSelectedParts = this.parseSelectedParts(selectedParts);
    return this.manualBuildService.checkCompatibilityAcrossLabels(
      newPartName,
      newPartLabel,
      parsedSelectedParts,
    );
  }

  @Get('compatible-parts')
  async getSpecificPartTypeCompatibleWithSelectedParts(
    @Query('selectedParts') selectedParts: string[],
    @Query('targetLabel') targetLabel: string,
  ) {
    const parsedSelectedParts = this.parseSelectedParts(selectedParts);
    return this.manualBuildService.getSpecificPartTypeCompatibleWithSelectedParts(
      parsedSelectedParts,
      targetLabel,
    );
  }

  @Post('auto-build')
  async autoBuild(@Body('userInput') userInput: string) {
    return this.autoBuildService.autoBuild(userInput);
  }

  private parseSelectedParts(selectedParts: string[]): any[] {
    if (typeof selectedParts === 'string') {
      try {
        return JSON.parse(selectedParts);
      } catch (error) {
        console.log(error);
        throw new Error('Invalid JSON format for selectedParts');
      }
    } else {
      return selectedParts.map((part) => JSON.parse(part));
    }
  }
}
