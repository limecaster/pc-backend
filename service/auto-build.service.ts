import { Injectable } from '@nestjs/common';
import { Neo4jConfigService } from 'config/neo4j.config';
import {
  AutoBuildDto,
  BudgetAllocation,
  Part,
  PartsData,
  PCConfiguration,
} from 'dto/auto-build.dto';
import { SpacyService } from './spacy.service';
import { CheckCompatibilityService } from './check-compatibility.service';

@Injectable()
export class AutoBuildService {
  private budgetAllocations = {
    gaming: {
      CPU: 0.25,
      Motherboard: 0.15,
      RAM: 0.1,
      InternalHardDrive: 0.1,
      GraphicsCard: 0.15,
      PowerSupply: 0.1,
      Case: 0.1,
      CPUCooler: 0.05,
    },
    workstation: {
      CPU: 0.25,
      Motherboard: 0.15,
      RAM: 0.15,
      InternalHardDrive: 0.15,
      GraphicsCard: 0.05,
      PowerSupply: 0.1,
      Case: 0.1,
      CPUCooler: 0.05,
    },
  };

  constructor(
    private readonly neo4jConfigService: Neo4jConfigService,
    private readonly spacyService: SpacyService,
    private readonly checkCompatibilityService: CheckCompatibilityService,
  ) {}

  async autoBuild(userInput: string): Promise<PCConfiguration> {
    const autoBuildDto = await this.extractUserInput(userInput);
    const { preferredParts, otherParts } =
      await this.allocateBudget(autoBuildDto);

    for (const part of Object.keys(otherParts)) {
      console.log(`${part}: ${otherParts[part].length}`);
    }

    return this.buildPC(preferredParts, otherParts);
  }

  private async extractUserInput(userInput: string): Promise<AutoBuildDto> {
    const autoBuildDto = new AutoBuildDto();
    const structuredData =
      await this.spacyService.extractStructuredData(userInput);
    console.log(structuredData);

    autoBuildDto.preferredParts = new Array<Part>();

    for (const [value, label] of structuredData) {
      switch (label) {
        case 'PURPOSE':
          autoBuildDto.purpose = this.parsePurpose(value);
          break;
        case 'BUDGET':
          autoBuildDto.budget = this.parseBudget(value);
          break;
        case 'CPU':
          autoBuildDto.preferredParts.push({ name: value, label });
          break;
        case 'GPU':
          autoBuildDto.preferredParts.push({
            name: value,
            label: 'GraphicsCard',
          });
          break;
      }
    }

    return autoBuildDto;
  }

  private parsePurpose(value: string): string {
    const gamingLikes = ['gaming', 'game', 'chơi game'];
    return gamingLikes.includes(value.toLowerCase()) ? 'gaming' : 'gaming';
  }

  private parseBudget(value: string): number {
    const USD_VND = 23000;
    let budget = parseInt(value.replace(/\D/g, ''));
    if (
      value.includes('trieu') ||
      value.includes('triệu') ||
      value.includes('tr')
    ) {
      budget *= 1000000;
    }
    return Math.floor(budget / USD_VND);
  }

  private async allocateBudget(
    autoBuildDto: AutoBuildDto,
  ): Promise<{ preferredParts: PartsData; otherParts: PartsData }> {
    const session = this.neo4jConfigService.getDriver().session();
    const parts = new PartsData();
    const budgetAllocation = {
      ...this.budgetAllocations[autoBuildDto.purpose],
    };
    const preferredPartsData = new PartsData();

    await this.fetchPreferredPartsData(
      autoBuildDto,
      session,
      preferredPartsData,
    );
    autoBuildDto.budget -= this.calculatePreferredPartsCost(preferredPartsData);
    console.log(
      'Preferred parts cost: ',
      this.calculatePreferredPartsCost(preferredPartsData),
    );
    this.allocateRemainingBudget(autoBuildDto, budgetAllocation);
    await this.fetchPartsWithinBudget(session, budgetAllocation, parts);

    return { preferredParts: preferredPartsData, otherParts: parts };
  }

  private combineLowHigh(low: number, high: number): number {
    return high * Math.pow(2, 32) + low;
  }

  private async fetchPreferredPartsData(
    autoBuildDto: AutoBuildDto,
    session: any,
    preferredPartsData: PartsData,
  ) {
    for (const part of autoBuildDto.preferredParts) {
      const indexName = this.getIndexName(part.label);
      const query = `CALL db.index.fulltext.queryNodes($indexName, $partname) YIELD node RETURN node LIMIT 1`;
      const result = await session.run(query, {
        indexName: indexName,
        partname: part.name,
      });
      preferredPartsData[part.label] = result.records.map((record) => {
        const properties = record.get('node').properties;
        for (const key in properties) {
          if (
            properties[key] &&
            typeof properties[key] === 'object' &&
            'low' in properties[key] &&
            'high' in properties[key]
          ) {
            properties[key] = this.combineLowHigh(
              properties[key].low,
              properties[key].high,
            );
          }
        }
        return properties;
      });
    }
  }

  private getIndexName(label: string): string {
    switch (label) {
      case 'CPU':
        return 'CPUNameFulltextIndex';
      case 'GraphicsCard':
        return 'GraphicsCardNameFulltextIndex';
      case 'Motherboard':
        return 'MotherboardNameFulltextIndex';
      case 'RAM':
        return 'RAMNameFulltextIndex';
      case 'InternalHardDrive':
        return 'InternalHardDriveNameFulltextIndex';
      case 'PowerSupply':
        return 'PowerSupplyNameFulltextIndex';
      case 'Case':
        return 'CaseNameFulltextIndex';
      case 'CPUCooler':
        return 'CPUCoolerNameFulltextIndex';
      default:
        return '';
    }
  }

  private calculatePreferredPartsCost(preferredPartsData: PartsData): number {
    return Object.values(preferredPartsData).reduce(
      (total, parts) => total + parts[0].price,
      0,
    );
  }

  private allocateRemainingBudget(
    autoBuildDto: AutoBuildDto,
    budgetAllocation: BudgetAllocation,
  ) {
    for (const part in budgetAllocation) {
      budgetAllocation[part] = autoBuildDto.budget * budgetAllocation[part];
    }
  }

  private async fetchPartsWithinBudget(
    session: any,
    budgetAllocation: BudgetAllocation,
    parts: PartsData,
  ) {
    for (const part in budgetAllocation) {
      const result = await session.run(
        `MATCH (part:${part}) WHERE part.price <= $price RETURN part`,
        { price: budgetAllocation[part] },
      );
      parts[part] = result.records.map((record) => {
        const properties = record.get('part').properties;
        for (const key in properties) {
          if (
            properties[key] &&
            typeof properties[key] === 'object' &&
            'low' in properties[key] &&
            'high' in properties[key]
          ) {
            properties[key] = this.combineLowHigh(
              properties[key].low,
              properties[key].high,
            );
          }
        }
        return properties;
      });
    }
  }

  private async buildPC(
    preferredParts: PartsData,
    otherParts: PartsData,
  ): Promise<PCConfiguration> {
    const pcConfiguration = new PCConfiguration();

    this.addPreferredPartsToConfiguration(preferredParts, pcConfiguration);
    await this.addCompatiblePartsToConfiguration(otherParts, pcConfiguration);

    return pcConfiguration;
  }

  private addPreferredPartsToConfiguration(
    preferredParts: PartsData,
    pcConfiguration: PCConfiguration,
  ) {
    for (const part in preferredParts) {
      if (preferredParts[part].length > 0) {
        pcConfiguration[part] = preferredParts[part][0];
      }
    }
  }

  private async addCompatiblePartsToConfiguration(
    otherParts: PartsData,
    pcConfiguration: PCConfiguration,
  ) {
    for (const part in otherParts) {
      if (otherParts[part].length > 0 && !pcConfiguration[part]) {
        for (const partData of otherParts[part]) {
          if (
            await this.checkCompatibilityService.checkCompatibility(
              { partData, label: part },
              pcConfiguration,
            )
          ) {
            pcConfiguration[part] = partData;
            break;
          }
        }
      }
    }
  }
}
