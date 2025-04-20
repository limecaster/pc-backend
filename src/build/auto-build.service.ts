import { Injectable } from '@nestjs/common';
import { Neo4jConfigService } from 'src/config/neo4j.config';
import {
    AutoBuildDto,
    BudgetAllocation,
    Part,
    PartsData,
    PCConfiguration,
} from 'src/build/dto/auto-build.dto';
import { SpacyService } from '../build/spacy.service';
import { CheckCompatibilityService } from './check-compatibility.service';
import { UtilsService } from '../service/utils.service';
import { BuildStateService } from './build-state.service';
import { BuildGateway } from '../gateway/build.gateway';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AutoBuildService {
    private budgetAllocations = {
        gaming: {
            CPU: 0.26,
            Motherboard: 0.17,
            RAM: 0.11,
            InternalHardDrive: 0.11,
            GraphicsCard: 0.47,
            PowerSupply: 0.22,
            Case: 0.11,
            CPUCooler: 0.11,
        },
        workstation: {
            CPU: 0.32,
            Motherboard: 0.22,
            RAM: 0.22,
            InternalHardDrive: 0.22,
            GraphicsCard: 0.12,
            PowerSupply: 0.17,
            Case: 0.17,
            CPUCooler: 0.12,
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
        private readonly buildGateway: BuildGateway,
        private readonly buildStateService: BuildStateService,
    ) {}

    private async extractUserInput(userInput: string): Promise<AutoBuildDto> {
        const autoBuildDto = new AutoBuildDto();
        const structuredData =
            await this.spacyService.extractStructuredData(userInput);
        autoBuildDto.userInput = userInput;
        autoBuildDto.preferredParts = new Array<Part>();

        for (const [value, label] of structuredData) {
            switch (label) {
                case 'PURPOSE':
                    autoBuildDto.purpose = this.parsePurpose(value);
                    break;
                case 'BUDGET':
                    autoBuildDto.budget = this.parseBudget(value);
                    break;

                case 'GPU':
                case 'GraphicsCard':
                    autoBuildDto.preferredParts.push({
                        name: value,
                        label: 'GraphicsCard',
                    });
                    break;
                case 'CPU':
                case 'GPUChipset':
                case 'RAM':
                case 'InternalHardDrive':
                case 'CPUCooler':
                case 'PowerSupply':
                case 'Case':
                case 'Motherboard':
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
        optionType: 'saving' | 'performance' | 'popular' = 'saving',
        userId: string,
    ): Promise<{ preferredParts: PartsData; otherParts: PartsData }> {
        const userState = this.buildStateService.getUserState(userId);
        const session = this.neo4jConfigService.getDriver().session();
        const preferredPartsData = new PartsData();
        const budgetAllocation = {
            ...this.budgetAllocations[autoBuildDto.purpose],
        };

        await this.fetchPreferredPartsData(
            autoBuildDto,
            session,
            preferredPartsData,
            userId,
        );

        if (autoBuildDto.preferredParts.length > 0) {
            for (const part in budgetAllocation) {
                budgetAllocation[part] += 0.15;
            }
        } else {
            for (const part in budgetAllocation) {
                budgetAllocation[part] += 0.1;
            }
        }

        if (!userState.isReducePreferredParts) {
            autoBuildDto.budget -=
                this.calculatePreferredPartsCost(preferredPartsData);
            userState.isReducePreferredParts = true;
        }

        this.allocateRemainingBudget(autoBuildDto, budgetAllocation);
        await this.fetchPartsWithinBudget(
            session,
            budgetAllocation,
            optionType,
            userId,
        );
        const otherParts = userState.partPools[optionType];
        return { preferredParts: preferredPartsData, otherParts };
    }

    private async fetchPreferredPartsData(
        autoBuildDto: AutoBuildDto,
        session: any,
        preferredPartsData: PartsData,
        userId: string,
    ) {
        const userState = this.buildStateService.getUserState(userId);

        if (
            userState.preferredPartsCache.userInput === autoBuildDto.userInput
        ) {
            Object.assign(
                preferredPartsData,
                userState.preferredPartsCache.data,
            );
            return;
        }

        for (const part of autoBuildDto.preferredParts) {
            if (part.label === 'GPUChipset') {
                // If GPUChipset detected, try to match with GPU.chipset
                const query = 'MATCH (p:GPU {chipset: $partname}) WHERE p.price IS NOT NULL AND p.price > 0 RETURN p';
                const result = await session.run(query, { partname: part.name });
                if (result.records.length > 0) {
                    preferredPartsData[part.label] = result.records[0].get('p');
                    continue;
                }
            }
            else {
                const indexName = this.getIndexName(part.label);
                const query = `CALL db.index.fulltext.queryNodes($indexName, $partname)
                     YIELD node, score
                     WHERE score > 0.6 AND node.price IS NOT NULL AND node.price > 0
                     ORDER BY score DESC
                     RETURN node
                     LIMIT 1`;
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
            });}
        }
        userState.preferredPartsCache.userInput = autoBuildDto.userInput;
        userState.preferredPartsCache.data = preferredPartsData;
    }

    private getIndexName(label: string): string {
        return label + 'NameFulltextIndex';
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

    private shouldRefreshCache(
        newBudget: BudgetAllocation,
        newUserInput: string,
        userId: string,
    ): boolean {
        const userState = this.buildStateService.getUserState(userId);
        const inputChanged = userState.lastUserInputHash !== newUserInput;

        if (inputChanged) {
            userState.lastUserInputHash = newUserInput;
            userState.partCache.clear();
            userState.lastBudgetSnapshot = {};
            return true;
        }

        return false;
    }

    private async fetchPartsWithinBudget(
        session: any,
        budgetAllocation: BudgetAllocation,
        sortOption: 'saving' | 'performance' | 'popular',
        userId: string,
    ) {
        const userState = this.buildStateService.getUserState(userId);

        this.shouldRefreshCache(
            budgetAllocation,
            userState.preferredPartsCache.userInput,
            userId,
        );

        for (const part in budgetAllocation) {
            const cacheKey = `${part}-${budgetAllocation[part]}-${sortOption}`;
            const lastBudgetForPart =
                userState.lastBudgetSnapshot[sortOption]?.[part];

            if (
                userState.partCache.has(cacheKey) &&
                lastBudgetForPart === budgetAllocation[part]
            ) {
                let parts = userState.partCache.get(cacheKey);
                // Filter out any previously removed candidates.
                if (
                    userState.removedCandidates[sortOption] &&
                    userState.removedCandidates[sortOption][part]
                ) {
                    const removedNames =
                        userState.removedCandidates[sortOption][part];
                    parts = parts.filter(
                        (item) => !removedNames.includes(item.name),
                    );
                }
                userState.partPools[sortOption][part] = parts;
                continue;
            }

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
            const result = await session.run(query, {
                price: budgetAllocation[part],
            });
            let parts = result.records.map((record) => {
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

            // Filter out any removed candidates.
            if (
                userState.removedCandidates[sortOption] &&
                userState.removedCandidates[sortOption][part]
            ) {
                const removedNames =
                    userState.removedCandidates[sortOption][part];
                parts = parts.filter(
                    (item) => !removedNames.includes(item.name),
                );
            }

            // Update cache and snapshot.
            userState.partCache.set(cacheKey, parts);
            if (!userState.lastBudgetSnapshot[sortOption]) {
                userState.lastBudgetSnapshot[sortOption] = {};
            }
            userState.lastBudgetSnapshot[sortOption][part] =
                budgetAllocation[part];

            userState.partPools[sortOption][part] = parts;
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

    /**
     * Dynamically reallocates budget across parts based on availability.
     * If a certain part type is missing, redistribute its budget proportionally to others.
     */
    private reallocateBudget(currentBudget: number): number {
        // Example: If a motherboard is missing, shift some budget from CPU/GPU to motherboard
        return Math.floor(currentBudget * 0.98 + 500_000); // Adjust dynamically
    }

    public async autoBuildAllOptions(userInput: string) {
        const autoBuildDto = await this.extractUserInput(userInput);
        autoBuildDto['initialBudget'] = autoBuildDto.budget;

        const [savingConfig, performanceConfig, popularConfig] =
            await Promise.all([
                this.buildOption(autoBuildDto, 'saving', 'anonymous'),
                this.buildOption(autoBuildDto, 'performance', 'anonymous'),
                this.buildOption(autoBuildDto, 'popular', 'anonymous'),
            ]);
        const totalCost = (config: PCConfiguration) => {
            let total = 0;
            for (const part in config) {
                if (config[part]) {
                    total += config[part].price;
                }
            }
            return total;
        };
        // console.log(`Saving: ${totalCost(savingConfig)} VND`);
        // console.log(`Performance: ${totalCost(performanceConfig)} VND`);
        // console.log(`Popular: ${totalCost(popularConfig)} VND`);
        return {
            saving: savingConfig,
            performance: performanceConfig,
            popular: popularConfig,
        };
    }

    private async buildOption(
        autoBuildDto: AutoBuildDto,
        optionType: 'saving' | 'performance' | 'popular',
        userId: string,
    ): Promise<PCConfiguration> {
        const userState = this.buildStateService.getUserState(userId);

        // Reset budget and reduce flag for each option
        autoBuildDto.budget = autoBuildDto.initialBudget;
        userState.isReducePreferredParts = false;

        const { preferredParts } = await this.allocateBudget(
            autoBuildDto,
            optionType,
            userId,
        );
        const session = this.neo4jConfigService.getDriver().session();

        this.allocateRemainingBudget(autoBuildDto, {
            ...this.budgetAllocations[autoBuildDto.purpose],
        });
        const budgetAllocation = new BudgetAllocation();
        for (const part in this.budgetAllocations[autoBuildDto.purpose]) {
            budgetAllocation[part] =
                autoBuildDto.budget *
                this.budgetAllocations[autoBuildDto.purpose][part];
        }
        await this.fetchPartsWithinBudget(
            session,
            budgetAllocation,
            optionType,
            userId,
        );

        let pcConfig = await this.buildPC(
            preferredParts,
            userState.partPools[optionType],
        );
        if (!this.isCompleteConfiguration(pcConfig)) {
            pcConfig = await this.backtrackAndRebuild(
                autoBuildDto,
                pcConfig,
                0,
                0,
                userId,
            );
        }
        session.close();
        return pcConfig;
    }

    /**
     * Deep-search buildPC: Recursively try combinations for all required parts.
     */
    private async buildPC(
        preferredParts: PartsData,
        otherParts: PartsData,
    ): Promise<PCConfiguration> {
        const pcConfiguration = new PCConfiguration();

        // Use a deep search to fill all parts.
        const success = await this.tryBuildConfiguration(
            preferredParts,
            otherParts,
            pcConfiguration,
            0,
        );

        return pcConfiguration;
    }

    /**
     * Recursively attempts to assign parts for each label in partOrder.
     *
     * For each part type, it builds a candidate pool (preferred parts first, then other parts).
     * It then iterates over the pool and applies the compatibility check.
     * If no candidate passes the check for a required part, it falls back to selecting the first candidate.
     */
    private async tryBuildConfiguration(
        preferredParts: PartsData,
        otherParts: PartsData,
        pcConfiguration: PCConfiguration,
        index: number,
    ): Promise<boolean> {
        if (index >= this.partOrder.length) {
            return this.isCompleteConfiguration(pcConfiguration);
        }

        const label = this.partOrder[index];
        const pool = [
            ...(preferredParts[label] || []),
            ...(otherParts[label] || []),
        ];

        if (pool.length === 0) return false;

        // console.log(`Trying to build ${label}...`);
        // console.log(`Pool: ${pool.length} parts`);
        // console.log(
        //     `Configuration Parts: ${JSON.stringify(this.extractConfigNames(pcConfiguration))}`,
        // );

        let candidateFound = false;

        // First try: iterate over the candidate pool in given order.
        for (const partData of pool) {
            if (
                await this.checkCompatibilityService.checkCompatibility(
                    { partData, label },
                    pcConfiguration,
                )
            ) {
                pcConfiguration[label] = partData;
                candidateFound = true;
                if (
                    await this.tryBuildConfiguration(
                        preferredParts,
                        otherParts,
                        pcConfiguration,
                        index + 1,
                    )
                ) {
                    return true;
                }
                // Backtrack if deeper recursion fails.
                pcConfiguration[label] = null;
            }
        }

        // Fallback: if no candidate passed and this part is required, select the first candidate unconditionally.
        if (!candidateFound && this.isRequiredPart(label)) {
            pcConfiguration[label] = pool[0];
            if (
                await this.tryBuildConfiguration(
                    preferredParts,
                    otherParts,
                    pcConfiguration,
                    index + 1,
                )
            ) {
                return true;
            }
            // Backtrack fallback.
            pcConfiguration[label] = null;
        }

        return false;
    }

    /**
     * Utility: Extracts a simple summary of the configuration (e.g., part names) for logging.
     */
    private extractConfigNames(
        pcConfiguration: PCConfiguration,
    ): Record<string, any> {
        const summary: Record<string, any> = {};
        for (const part of this.partOrder) {
            summary[part] = pcConfiguration[part]
                ? pcConfiguration[part].name || 'N/A'
                : null;
        }
        return summary;
    }

    /**
     * Determines if a part is required.
     */
    private isRequiredPart(label: string): boolean {
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
        return requiredParts.includes(label);
    }

    /**
     * Backtracking function: If a complete configuration isn't found with deep search,
     * adjust the budget and retry.
     */
    private async backtrackAndRebuild(
        autoBuildDto: AutoBuildDto,
        partialConfig: PCConfiguration,
        attempts = 0,
        lastBudgetIncrease = 0,
        userId: string,
    ): Promise<PCConfiguration> {
        const { preferredParts, otherParts } = await this.allocateBudget(
            autoBuildDto,
            'performance',
            userId,
        );
        const configuration = new PCConfiguration();
        Object.assign(configuration, partialConfig);

        const success = await this.tryBuildConfiguration(
            preferredParts,
            otherParts,
            configuration,
            0,
        );

        if (!success || !this.isCompleteConfiguration(configuration)) {
            if (
                attempts >= 30 ||
                lastBudgetIncrease >= 3 ||
                this.calculateTotalCost(configuration) >
                    autoBuildDto.initialBudget * 1.2
            ) {
                return configuration;
            }

            // Try to reallocate budget before increasing it.
            if (attempts % 5 === 0) {
                autoBuildDto.budget = this.reallocateBudget(
                    autoBuildDto.budget,
                );
            } else {
                autoBuildDto.budget = Math.floor(autoBuildDto.budget * 1.05);
                lastBudgetIncrease++;
            }

            return this.backtrackAndRebuild(
                autoBuildDto,
                configuration,
                attempts + 1,
                lastBudgetIncrease,
                userId,
            );
        }

        return configuration;
    }

    /**
     * Recursively collects all valid PC configurations.
     * After a successful configuration, randomly remove one used part from its pool.
     */
    private async collectAllConfigurations(
        preferredParts: PartsData,
        otherParts: PartsData,
        pcConfiguration: PCConfiguration,
        index: number,
        results: PCConfiguration[],
    ): Promise<void> {
        if (index >= this.partOrder.length) {
            if (this.isCompleteConfiguration(pcConfiguration)) {
                // Clone and add configuration to results.
                results.push({ ...pcConfiguration });
                // Randomly choose one label from partOrder.
                const randIndex = Math.floor(
                    Math.random() * this.partOrder.length,
                );
                const randomLabel = this.partOrder[randIndex];
                const candidateName = pcConfiguration[randomLabel]?.name;
                if (candidateName) {
                    const removeCandidate = (arr: any[]) =>
                        arr.filter((item) => item.name !== candidateName);
                    if (preferredParts[randomLabel]) {
                        preferredParts[randomLabel] = removeCandidate(
                            preferredParts[randomLabel],
                        );
                    }
                    if (otherParts[randomLabel]) {
                        otherParts[randomLabel] = removeCandidate(
                            otherParts[randomLabel],
                        );
                    }
                }
            }
            return;
        }
        const label = this.partOrder[index];
        const pool = [
            ...(preferredParts[label] || []),
            ...(otherParts[label] || []),
        ];
        if (pool.length === 0) return;
        // console.log(`Trying to build ${label}...`);
        // console.log(`Pool: ${pool.length} parts`);
        // console.log(
        //     `Configuration Parts: ${JSON.stringify(this.extractConfigNames(pcConfiguration))}`,
        // );
        for (const candidate of pool) {
            if (
                await this.checkCompatibilityService.checkCompatibility(
                    { partData: candidate, label },
                    pcConfiguration,
                )
            ) {
                pcConfiguration[label] = candidate;
                await this.collectAllConfigurations(
                    preferredParts,
                    otherParts,
                    pcConfiguration,
                    index + 1,
                    results,
                );
                pcConfiguration[label] = null;
            }
        }
    }

    public async getAllPCConfigurations(
        userInput: string,
        userId?: string,
    ): Promise<{
        performance: PCConfiguration[];
        popular: PCConfiguration[];
    }> {
        // Generate a userId if not provided
        const sessionId = userId || `anonymous-${uuidv4()}`;
        const userState = this.buildStateService.getUserState(sessionId);

        const autoBuildDto = await this.extractUserInput(userInput);
        autoBuildDto['initialBudget'] = autoBuildDto.budget;
        const options = ['performance', 'popular'] as const;
        const results: {
            performance: PCConfiguration[];
            popular: PCConfiguration[];
        } = { performance: [], popular: [] };
        const maxAttempts = 30;

        // Reset removal record for each run
        userState.removedCandidates = {
            performance: {},
            popular: {},
        };

        for (const option of options) {
            const builds: PCConfiguration[] = [];
            let attempts = 0;
            // Ensure candidate pools are refreshed for this option.
            await this.allocateBudget(autoBuildDto, option, sessionId);
            while (attempts < maxAttempts) {
                // Reset budget for each attempt.
                autoBuildDto.budget = autoBuildDto.initialBudget;
                const config = await this.buildOption(
                    autoBuildDto,
                    option,
                    sessionId,
                );
                if (!this.isCompleteConfiguration(config)) break;

                const configStr = JSON.stringify(config);

                // Prevent duplicate configurations.
                if (
                    !builds.some(
                        (existingConfig) =>
                            JSON.stringify(existingConfig) === configStr,
                    )
                ) {
                    builds.push(config);

                    // Randomly choose one part label from partOrder.
                    const randomLabel =
                        this.partOrder[
                            Math.floor(Math.random() * this.partOrder.length)
                        ];
                    const candidateName = config[randomLabel]?.name;
                    if (candidateName) {
                        // Record the removal persistently.
                        if (!userState.removedCandidates[option][randomLabel]) {
                            userState.removedCandidates[option][randomLabel] =
                                [];
                        }
                        userState.removedCandidates[option][randomLabel].push(
                            candidateName,
                        );

                        // Optionally update the in-memory candidate pool immediately.
                        if (userState.partPools[option][randomLabel]) {
                            userState.partPools[option][randomLabel] =
                                userState.partPools[option][randomLabel].filter(
                                    (item) => item.name !== candidateName,
                                );
                        }
                    }
                    if (this.isCompleteConfiguration(config)) {
                        this.buildGateway.sendConfigUpdate(config, userId);
                    }
                }
                attempts++;
            }
            results[option] = builds;
        }

        return results;
    }

    private removedCandidates: {
        performance: { [partLabel: string]: string[] };
        popular: { [partLabel: string]: string[] };
    } = {
        performance: {},
        popular: {},
    };

    public async getSinglePCConfiguration(userInput: string, userId?: string) {
        const sessionId = userId || `anonymous-${uuidv4()}`;
        const autoBuildDto = await this.extractUserInput(userInput);
        autoBuildDto['initialBudget'] = autoBuildDto.budget;
        const singleConfig = await this.buildOption(
            autoBuildDto,
            'performance',
            sessionId,
        );
        return singleConfig;
    }
}
