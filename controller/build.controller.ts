import { Body, Controller, Get, Param, Query } from '@nestjs/common';
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
    return this.manualBuildService.findCompatipleParts(name, otherPartTypeName);
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
    // selectedParts can be parsed into { id, label } objects
    console.log(selectedParts);
    let parsedSelectedParts;
    // Ensure selectedParts is parsed as an array of objects
    if (typeof selectedParts === 'string') {
      try {
        parsedSelectedParts = JSON.parse(selectedParts);
      } catch (error) {
        throw error;
      }
    } else {
      parsedSelectedParts = selectedParts.map((part) => JSON.parse(part));
    }
    console.log(parsedSelectedParts);
    console.log(newPartName);
    console.log(newPartLabel);
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
    let parsedSelectedParts;
    console.log(selectedParts);
    // Ensure selectedParts is parsed as an array of objects
    if (typeof selectedParts === 'string') {
      try {
        parsedSelectedParts = JSON.parse(selectedParts);
      } catch (error) {
        throw error;
      }
    } else {
      parsedSelectedParts = selectedParts.map((part) => JSON.parse(part));
    }
    return this.manualBuildService.getSpecificPartTypeCompatibleWithSelectedParts(
      parsedSelectedParts,
      targetLabel,
    );
  }

  @Get('auto-build')
  async autoBuild(@Body('userInput') userInput: string) {
    console.log(userInput);
    return this.autoBuildService.autoBuild(userInput);
  }
}
