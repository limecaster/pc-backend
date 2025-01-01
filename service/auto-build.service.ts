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
import { UtilsService } from './utils.service';

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

    private isReducePreferredParts = false;

    private partPools = {
        saving: {
            CPU: [],
            Motherboard: [],
            RAM: [],
            InternalHardDrive: [],
            GraphicsCard: [],
            PowerSupply: [],
            Case: [],
            CPUCooler: [],
        },
        performance: {
            CPU: [],
            Motherboard: [],
            RAM: [],
            InternalHardDrive: [],
            GraphicsCard: [],
            PowerSupply: [],
            Case: [],
            CPUCooler: [],
        },
        popular: {
            CPU: [],
            Motherboard: [],
            RAM: [],
            InternalHardDrive: [],
            GraphicsCard: [],
            PowerSupply: [],
            Case: [],
            CPUCooler: [],
        },
    };

    private partOrder = [
        'CPU',
        'CPUCooler',
        'Motherboard',
        'GraphicsCard',
        'RAM',
        'InternalHardDrive',
        'Case',
        'PowerSupply',
    ];

    constructor(
        private readonly neo4jConfigService: Neo4jConfigService,
        private readonly spacyService: SpacyService,
        private readonly checkCompatibilityService: CheckCompatibilityService,
        private readonly utilsService: UtilsService,
    ) {}

    async autoBuild(userInput: string): Promise<PCConfiguration> {
        const autoBuildDto = await this.extractUserInput(userInput);
        autoBuildDto['initialBudget'] = autoBuildDto.budget;
        const { preferredParts, otherParts } =
            await this.allocateBudget(autoBuildDto);
        let pcConfiguration = await this.buildPC(preferredParts, otherParts);
        if (!this.isCompleteConfiguration(pcConfiguration)) {
            pcConfiguration = await this.backtrackAndRebuild(
                autoBuildDto,
                pcConfiguration,
            );
        }

        let totalCost = 0;
        for (const part in pcConfiguration) {
            if (pcConfiguration[part]) {
                totalCost += pcConfiguration[part].price;
            }
        }
        console.log(`Total cost: ${totalCost} VND`);
        return pcConfiguration;
    }

    private async extractUserInput(userInput: string): Promise<AutoBuildDto> {
        const autoBuildDto = new AutoBuildDto();
        const structuredData =
            await this.spacyService.extractStructuredData(userInput);

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
                case 'RAM':
                    autoBuildDto.preferredParts.push({ name: value, label });
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
        let budget = parseInt(value.replace(/\D/g, ''));
        if (
            value.includes('trieu') ||
            value.includes('triệu') ||
            value.includes('tr')
        ) {
            budget *= 1000000;
        }
        return Math.floor(budget);
    }

    private async allocateBudget(
        autoBuildDto: AutoBuildDto,
    ): Promise<{ preferredParts: PartsData; otherParts: PartsData }> {
        const session = this.neo4jConfigService.getDriver().session();
        const preferredPartsData = new PartsData();
        const budgetAllocation = {
            ...this.budgetAllocations[autoBuildDto.purpose],
        };

        await this.fetchPreferredPartsData(
            autoBuildDto,
            session,
            preferredPartsData,
        );

        if (!this.isReducePreferredParts) {
            autoBuildDto.budget -=
                this.calculatePreferredPartsCost(preferredPartsData);
            this.isReducePreferredParts = true;
        }

        this.allocateRemainingBudget(autoBuildDto, budgetAllocation);
        await this.fetchPartsWithinBudget(
            session,
            budgetAllocation,
            'saving',
        );
        const otherParts = this.partPools['saving'];
        return { preferredParts: preferredPartsData, otherParts };
    }

    private async fetchPreferredPartsData(
        autoBuildDto: AutoBuildDto,
        session: any,
        preferredPartsData: PartsData,
    ) {
        for (const part of autoBuildDto.preferredParts) {
            const indexName = this.getIndexName(part.label);
            const query = `CALL db.index.fulltext.queryNodes($indexName, $partname)
                     YIELD node, score
                     ORDER BY score DESC
                     RETURN node LIMIT 1`;
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
                        properties[key] = this.utilsService.combineLowHigh(
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
            (total, parts) => total + parts[0]?.price,
            0,
        );
    }

    private allocateRemainingBudget(
        autoBuildDto: AutoBuildDto,
        budgetAllocation: BudgetAllocation,
    ) {
        for (const part in budgetAllocation) {
            budgetAllocation[part] =
                autoBuildDto.budget * budgetAllocation[part];
        }
    }

    private async fetchPartsWithinBudget(
        session: any,
        budgetAllocation: BudgetAllocation,
        sortOption: 'saving' | 'performance' | 'popular',
    ) {
        for (const part in budgetAllocation) {
            let orderClause = 'ORDER BY part.price ASC';
            if (sortOption === 'performance') {
                orderClause = 'ORDER BY part.benchmarkScore DESC';
            } else if (sortOption === 'popular') {
                orderClause = 'ORDER BY part.solds DESC';
            }

            const query = `
              MATCH (part:${part})
              WHERE part.price IS NOT NULL AND part.price <= $price 
              ${orderClause}
              RETURN part
            `;
            const result = await session.run(query, { price: budgetAllocation[part] });
            this.partPools[sortOption][part] = result.records.map((record) => {
                const properties = record.get('part').properties;
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
        await this.addCompatiblePartsToConfiguration(
            otherParts,
            pcConfiguration,
        );
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
        for (const label of this.partOrder) {
            if (otherParts[label]?.length && !pcConfiguration[label]) {
                for (const partData of otherParts[label]) {
                    if (
                        await this.checkCompatibilityService.checkCompatibility(
                            { partData, label },
                            pcConfiguration,
                        )
                    ) {
                        pcConfiguration[label] = partData;
                        break;
                    }
                }
            }
        }
    }

    public isCompleteConfiguration(pcConfiguration: PCConfiguration): boolean {
        const requiredParts = [
            'CPU',
            'Motherboard',
            'RAM',
            'GraphicsCard',
            'PowerSupply',
            'Case',
            'CPUCooler',
            'InternalHardDrive',
        ];
        return requiredParts.every((part) => pcConfiguration[part]);
    }

    private calculateTotalCost(pcConfiguration: PCConfiguration): number {
        return Object.values(pcConfiguration).reduce(
            (total, part) => total + part?.price,
            0,
        );
    }

    private async backtrackAndRebuild(
        autoBuildDto: AutoBuildDto,
        partialConfig: PCConfiguration,
        attempts = 0,
    ): Promise<PCConfiguration> {
        const { preferredParts, otherParts } =
            await this.allocateBudget(autoBuildDto);
        const configuration = new PCConfiguration();

        // Copy partialConfig into configuration
        for (const part of Object.keys(partialConfig)) {
            if (partialConfig[part]) {
                configuration[part] = partialConfig[part];
            }
        }

        const tryPart = async (index: number): Promise<boolean> => {
            if (index >= this.partOrder.length) return true;
            const label = this.partOrder[index];
            if (configuration[label]) {
                return await tryPart(index + 1);
            }
            const pool = preferredParts[label]?.length
                ? preferredParts[label]
                : otherParts[label];
            if (!pool || pool.length === 0) {
                return await tryPart(index + 1);
            }
            for (const partData of pool) {
                if (
                    await this.checkCompatibilityService.checkCompatibility(
                        { partData, label },
                        configuration,
                    )
                ) {
                    configuration[label] = partData;
                    if (await tryPart(index + 1)) return true;
                    configuration[label] = null;
                }
            }
            return false;
        };

        await tryPart(0);

        if (!this.isCompleteConfiguration(configuration)) {
            if (attempts >= 30 || this.calculateTotalCost(configuration) > autoBuildDto.initialBudget * 1.2) {
                // Return partial configuration or an indication that we can't fully build
                return configuration;
            }
            autoBuildDto.budget = Math.floor(autoBuildDto.budget * 1.05);
            return this.backtrackAndRebuild(autoBuildDto, configuration, attempts + 1);
        }

        return configuration;
    }

    public async autoBuildAllOptions(userInput: string) {
        const autoBuildDto = await this.extractUserInput(userInput);
        autoBuildDto['initialBudget'] = autoBuildDto.budget;

        const [savingConfig, performanceConfig, popularConfig] = await Promise.all([
            this.buildOption(autoBuildDto, 'saving'),
            this.buildOption(autoBuildDto, 'performance'),
            this.buildOption(autoBuildDto, 'popular')
        ]);
        const totalCost = (config: PCConfiguration) => {
            let total = 0;
            for (const part in config) {
                if (config[part]) {
                    total += config[part].price;
                }
            }
            return total;
        }
        console.log(`Saving: ${totalCost(savingConfig)} VND`);
        console.log(`Performance: ${totalCost(performanceConfig)} VND`);
        console.log(`Popular: ${totalCost(popularConfig)} VND`);
        return {
          saving: savingConfig,
          performance: performanceConfig,
          popular: popularConfig,
        };
    }

    private async buildOption(
        autoBuildDto: AutoBuildDto,
        optionType: 'saving' | 'performance' | 'popular',
    ): Promise<PCConfiguration> {
        // Reset budget and reduce flag for each option
        autoBuildDto.budget = autoBuildDto.initialBudget;
        this.isReducePreferredParts = false;

        const { preferredParts } = await this.allocateBudget(autoBuildDto);
        const session = this.neo4jConfigService.getDriver().session();

        this.allocateRemainingBudget(autoBuildDto, {
            ...this.budgetAllocations[autoBuildDto.purpose],
        });
        const budgetAllocation = new BudgetAllocation();
        for (const part in this.budgetAllocations[autoBuildDto.purpose]) {
            budgetAllocation[part] =
                autoBuildDto.budget * this.budgetAllocations[autoBuildDto.purpose][part];
        }
        await this.fetchPartsWithinBudget(
            session,
            budgetAllocation,
            optionType,
        );

        let pcConfig = await this.buildPC(preferredParts, this.partPools[optionType]);
        if (!this.isCompleteConfiguration(pcConfig)) {
            pcConfig = await this.backtrackAndRebuild(autoBuildDto, pcConfig);
        }
        session.close();
        return pcConfig;
        
    }
}
