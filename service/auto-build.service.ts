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

@Injectable()
export class AutoBuildService {
  constructor(
    private readonly neo4jConfigService: Neo4jConfigService,
    private readonly spacyService: SpacyService,
  ) {}

  // There are relationships between the parts in the Neo4j database
  // that need to be checked for compatibility
  // If 2 any parts are not appearing in the neo4jRelationships, they are compatible
  // If 2 any parts are appearing in the neo4jRelationships, then we need to check
  //              if they are compatible by calling to the Neo4j database
  private neo4jRelationships = new Set([
    'Case->GraphicsCard',
    'Case->PowerSupply',
    'Motherboard->Case',
    'Motherboard->PowerSupply',
    'CPU->CPUCooler',
    'Motherboard->CPUCooler',
    'Motherboard->InternalHardDrive',
    'Motherboard->RAM',
    'PowerSupply->GraphicsCard',
    'Motherboard->CPU',
  ]);

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

  async autoBuild(userInput: string): Promise<PCConfiguration> {
    const autoBuildDto = await this.extractUserInput(userInput);

    const { preferredParts, otherParts } =
      await this.allocateBudget(autoBuildDto);

    for (const part of Object.keys(otherParts)) {
      console.log(`${part}: ${otherParts[part].length}`);
      // if (otherParts[part].length === 0) {
      //   throw new Error('No parts found within budget and your preferences');
      // }
    }
    const pcConfiguration = await this.buildPC(preferredParts, otherParts);
    return pcConfiguration;
  }

  private async extractUserInput(userInput: string): Promise<AutoBuildDto> {
    const autoBuildDto = new AutoBuildDto();
    const structuredData =
      await this.spacyService.extractStructuredData(userInput);
    console.log(structuredData);
    autoBuildDto.preferredParts = new Array<Part>();
    // Structured data format:
    // [[value, label], [value, label], ...]
    // Example:
    // [['gaming', 'PURPOSE'], ['20 trieu', 'BUDGET'], ['Intel Core i7-14700K', 'CPU'], ...]
    for (const data of structuredData) {
      const [value, label] = data;
      if (label === 'PURPOSE') {
        // Parsing likes gaming string -> gaming
        const gamingLikes = ['gaming', 'game', 'chơi game'];
        if (value.toLowerCase() in gamingLikes) autoBuildDto.purpose = 'gaming';
        else autoBuildDto.purpose = 'gaming';
      } else if (label === 'BUDGET') {
        // If budget contains 'trieu' 'triệu' 'tr' then multiply it to 1000000
        if (
          value.includes('trieu') ||
          value.includes('triệu') ||
          value.includes('tr')
        ) {
          autoBuildDto.budget = parseInt(value) * 1000000;
        } else autoBuildDto.budget = parseInt(value);

        // Temporary we convert VND to USD
        console.log(autoBuildDto.budget);
        const USD_VND = 23000;
        autoBuildDto.budget = Math.floor(autoBuildDto.budget / USD_VND);
        console.log(autoBuildDto.budget);
      } else {
        if (label === 'CPU') {
          autoBuildDto.preferredParts.push({ name: value, label: label });
        } else if (label === 'GPU') {
          autoBuildDto.preferredParts.push({
            name: value,
            label: 'GraphicsCard',
          });
        }
      }
    }
    // autoBuildDto.budget = 1500;
    // autoBuildDto.purpose = 'gaming';
    // autoBuildDto.preferredParts = [
    //   { name: 'Intel Core i7-14700K', label: 'CPU' },
    //   {
    //     name: 'MSI PRO Z790-P WIFI ATX LGA1700 Motherboard',
    //     label: 'Motherboard',
    //   },
    // ];
    return autoBuildDto;
  }

  private async allocateBudget(
    autoBuildDto: AutoBuildDto,
  ): Promise<{ preferredParts: PartsData; otherParts: PartsData }> {
    const session = this.neo4jConfigService.getDriver().session();

    const parts = new PartsData();
    const budgetAllocation = this.budgetAllocations[autoBuildDto.purpose];
    console.log(budgetAllocation, autoBuildDto.purpose);
    const preferredPartsData = new PartsData();

    // Call the Neo4j database to get the preferred parts data
    // Using full text search to get the preferred parts
    for (const part of autoBuildDto.preferredParts) {
      try {
        let index_name;
        if (part.label === 'CPU') index_name = 'CPUNameFulltextIndex';
        else if (part.label === 'GraphicsCard')
          index_name = 'GraphicsCardNameFulltextIndex';
        const query = `CALL db.index.fulltext.queryNodes("${index_name}", "${part.name}") YIELD node RETURN node LIMIT 1`;
        const result = await session.run(query);
        preferredPartsData[part.label] = result.records.map(
          (record) => record.get('node').properties,
        );
      } catch (error) {
        throw error;
      }
    }

    // Reduce the budget based on the preferred parts data
    let preferredPartsCost = 0;
    for (const part of Object.keys(preferredPartsData)) {
      preferredPartsCost += preferredPartsData[part][0].price;
    }
    console.log(preferredPartsCost);
    autoBuildDto.budget -= preferredPartsCost;
    // Allocate the budget to the remaining parts
    for (const part of Object.keys(budgetAllocation)) {
      const partCost = autoBuildDto.budget * budgetAllocation[part];
      budgetAllocation[part] = partCost;
    }

    // Call the Neo4j database to get the parts within budget, excluding the preferred parts
    for (const part of Object.keys(budgetAllocation)) {
      try {
        const result = await session.run(
          `MATCH (part:${part}) WHERE part.price <= $price RETURN part`,
          { price: budgetAllocation[part] },
        );
        parts[part] = result.records.map(
          (record) => record.get('part').properties,
        );
      } catch (error) {
        throw error;
      }
    }

    // Add the preferred parts to the parts list
    return { preferredParts: preferredPartsData, otherParts: parts };
  }

  private async buildPC(
    preferredParts: PartsData,
    otherParts: PartsData,
  ): Promise<PCConfiguration> {
    const pcConfiguration = new PCConfiguration();

    // If preferredParts is not empty, add them to the pcConfiguration
    for (const part of Object.keys(preferredParts)) {
      if (preferredParts[part].length > 0) {
        pcConfiguration[part] = preferredParts[part][0];
      }
    }

    // Add the remaining parts to the pcConfiguration
    // where they are compatible with the preferred parts, and other parts
    for (const part of Object.keys(otherParts)) {
      if (otherParts[part].length > 0 && !pcConfiguration[part]) {
        for (const partData of otherParts[part]) {
          if (
            await this.checkCompatibility(
              { name: partData.name, label: part },
              pcConfiguration,
            )
          ) {
            pcConfiguration[part] = partData;
            break;
          }
        }
      }
    }
    return pcConfiguration;
  }

  private compatibilityCache: Map<string, boolean> = new Map();

  private async checkCompatibility(
    part: { name: string; label: string },
    pcConfiguration: PCConfiguration,
  ): Promise<boolean> {
    const session = this.neo4jConfigService.getDriver().session();
    try {
      for (const partType of Object.keys(pcConfiguration)) {
        const cacheKey = `${part.label}:${part.name}|${partType}:${pcConfiguration[partType].name}`;
        if (this.compatibilityCache.has(cacheKey)) {
          if (!this.compatibilityCache.get(cacheKey)) {
            return false;
          }
          continue;
        }

        let isCompatible = true;
        if (this.neo4jRelationships.has(`${partType}->${part.label}`)) {
          const query = `
            MATCH (p1:${partType} {name: $name1})
            -[:COMPATIBLE_WITH]->
            (p2:${part.label} {name: $name2})
            RETURN p1
          `;
          const result = await session.run(query, {
            name1: pcConfiguration[partType].name,
            name2: part.name,
          });
          isCompatible = result.records.length > 0;
        } else if (this.neo4jRelationships.has(`${part.label}->${partType}`)) {
          const query = `
            MATCH (p1:${part.label} {name: $name1})
            -[:COMPATIBLE_WITH]->
            (p2:${partType} {name: $name2})
            RETURN p1
          `;
          const result = await session.run(query, {
            name1: part.name,
            name2: pcConfiguration[partType].name,
          });
          isCompatible = result.records.length > 0;
        }

        this.compatibilityCache.set(cacheKey, isCompatible);
        if (!isCompatible) {
          return false;
        }
      }
      return true;
    } finally {
      await session.close();
    }
  }
}
