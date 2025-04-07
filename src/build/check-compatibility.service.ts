import { Injectable } from '@nestjs/common';
import { Neo4jConfigService } from 'config/neo4j.config';
import { PCConfiguration } from 'src/build/dto/auto-build.dto';

/**
 * Service to check compatibility of PC parts using Neo4j database and dynamic checks.
 */
@Injectable()
export class CheckCompatibilityService {
    /**
     * Creates an instance of CheckCompatibilityService.
     * @param neo4jConfigService - Service to get Neo4j configuration.
     */
    constructor(private readonly neo4jConfigService: Neo4jConfigService) {}

    /**
     * Cache to store compatibility results.
     */
    private compatibilityCache: Map<string, boolean> = new Map();

    /**
     * Set of Neo4j relationships to check compatibility.
     */
    private neo4jRelationships = new Set([
        'CPU->Motherboard',
        'CPU->CPUCooler',
        'Motherboard->CPUCooler',
        'Motherboard->RAM',
        'Motherboard->InternalHardDrive',
        'Motherboard->PowerSupply',
        'Motherboard->Case',
        'Case->PowerSupply',
        'Case->GraphicsCard',
        'PowerSupply->GraphicsCard',
    ]);

    private totalWattage: number = 0;

    /**
     * Runs a Neo4j query to check compatibility.
     * @param session - Neo4j session.
     * @param query - Cypher query string.
     * @param params - Query parameters.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    private async runNeo4jQuery(
        session: any,
        query: string,
        params: { name1: string; name2: string },
    ): Promise<boolean> {
        const result = await session.run(query, params);
        return result.records.length > 0;
    }

    /**
     * Checks compatibility of a part with the PC configuration using Neo4j.
     * @param part - Part to check.
     * @param pcConfiguration - Current PC configuration.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    public async neo4jCheckCompatibility(
        part: { name: string; label: string },
        pcConfiguration: PCConfiguration,
    ): Promise<boolean> {
        const session = this.neo4jConfigService.getDriver().session();
        try {
            for (const partType of Object.keys(pcConfiguration)) {
                if (
                    !pcConfiguration[partType] ||
                    !pcConfiguration[partType].name
                ) {
                    return false;
                }
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
                    isCompatible = await this.runNeo4jQuery(session, query, {
                        name1: pcConfiguration[partType].name,
                        name2: part.name,
                    });
                } else if (
                    this.neo4jRelationships.has(`${part.label}->${partType}`)
                ) {
                    const query = `
                        MATCH (p1:${part.label} {name: $name1})
                        -[:COMPATIBLE_WITH]->
                        (p2:${partType} {name: $name2})
                        RETURN p1
                    `;
                    isCompatible = await this.runNeo4jQuery(session, query, {
                        name1: part.name,
                        name2: pcConfiguration[partType].name,
                    });
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

    /**
     * Calculates the total wattage required by the PC configuration.
     * @param pcConfiguration - Current PC configuration.
     * @returns Total wattage required.
     */
    private calculateTotalWattage(pcConfiguration: PCConfiguration): number {
        const componentPowerConsumption = {
            CPU: pcConfiguration['CPU']?.['tdp'] || 0,
            GraphicsCard: pcConfiguration['GraphicsCard']?.['tdp'] || 0,
            Motherboard: pcConfiguration['Motherboard'] ? 80 : 0,
            RAM: Array.isArray(pcConfiguration['RAM'])
                ? pcConfiguration['RAM'].reduce(
                      (acc, ram) => acc + ram['moduleNumber'] * 5,
                      0,
                  )
                : 0,
            InternalHardDrive: Array.isArray(
                pcConfiguration['InternalHardDrive'],
            )
                ? pcConfiguration['InternalHardDrive'].reduce(
                      (acc, drive) =>
                          acc + (drive['formFactor'] === '2.5' ? 5 : 10),
                      0,
                  )
                : 0,
            CPUCooler: pcConfiguration['CPUCooler'] ? 15 : 0,
        };
        const totalPower = Object.values(componentPowerConsumption).reduce(
            (acc, power) => acc + power,
            0,
        );
        return totalPower;
    }

    /**
     * Updates the total wattage required by the PC configuration.
     * @param pcConfiguration - Current PC configuration.
     */
    public updateTotalWattage(pcConfiguration: PCConfiguration): void {
        this.totalWattage = this.calculateTotalWattage(pcConfiguration);
    }

    /**
     * Checks if the selected power supply can supply power to the other parts.
     * @param pcConfiguration - Current PC configuration.
     * @param partData - Data of the power supply part.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    private async checkPowerSupply(
        pcConfiguration: PCConfiguration,
        partData: object,
    ): Promise<boolean> {
        return partData['wattage'] >= this.totalWattage * 1.25; // Add 25% overhead
    }

    /**
     * Checks if the selected motherboard can serve the other parts.
     * @param pcConfiguration - Current PC configuration.
     * @param partData - Data of the motherboard part.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    private async checkMotherboard(
        pcConfiguration: PCConfiguration,
        partData: object,
    ): Promise<boolean> {
        let ramSlots = partData['memorySlots'];
        let ramSize = partData['memoryMax'];
        if (Array.isArray(pcConfiguration['RAM'])) {
            const ramslot = pcConfiguration['RAM'].reduce(
                (acc, ram) => acc + ram['moduleNumber'],
                0,
            );
            const ramsize = pcConfiguration['RAM'].reduce(
                (acc, ram) => acc + ram['moduleSize'],
                0,
            );

            ramSlots -= ramslot;
            ramSize -= ramsize;
        }
        const pciSlots =
            Number(partData['pciSlots']) -
            this.countUsedSlots(pcConfiguration, 'PCI');
        const pcieX1Slots =
            Number(partData['pcieX1Slots']) -
            this.countUsedSlots(pcConfiguration, 'PCIe x1');
        const pcieX4Slots =
            Number(partData['pcieX4Slots']) -
            this.countUsedSlots(pcConfiguration, 'PCIe x4');
        const pcieX8Slots =
            Number(partData['pcieX8Slots']) -
            this.countUsedSlots(pcConfiguration, 'PCIe x8');
        const pcieX16Slots =
            Number(partData['pcieX16Slots']) -
            this.countUsedSlots(pcConfiguration, 'PCIe x16');

        const sataSlots =
            (!partData['sata6Gbps'] ? 0 : partData['sata6Gbps']) -
            this.countUsedHardDriveSlots(pcConfiguration, '2.5', '3.5');
        const mSataSlots =
            partData['msataSlots'] -
            this.countUsedHardDriveSlots(pcConfiguration, 'mSATA');
        const m2Slots =
            (partData['m2Slots']?.length || 0) -
            this.countUsedM2Slots(pcConfiguration, partData['m2Slots']);

        const isEnoughGraphicsCardSlots =
            pciSlots >= 0 &&
            pcieX1Slots >= 0 &&
            pcieX4Slots >= 0 &&
            pcieX8Slots >= 0 &&
            pcieX16Slots >= 0;
        const isEnoughRAMSlots = ramSlots >= 0;
        const isEnoughRAMSize = ramSize <= partData['memoryMax'];
        const isEnoughInternalHardDriveSlots =
            sataSlots >= 0 && mSataSlots >= 0 && m2Slots >= 0;
        return (
            isEnoughGraphicsCardSlots &&
            isEnoughRAMSlots &&
            isEnoughRAMSize &&
            isEnoughInternalHardDriveSlots
        );
    }

    /**
     * Counts the number of used slots of a specific interface type.
     * @param pcConfiguration - Current PC configuration.
     * @param interfaceType - Type of interface to count.
     * @returns Number of used slots.
     */
    private countUsedSlots(
        pcConfiguration: PCConfiguration,
        interfaceType: string,
    ): number {
        return Array.isArray(pcConfiguration['GraphicsCard'])
            ? pcConfiguration['GraphicsCard'].reduce(
                  (acc, graphicsCard) =>
                      acc +
                      (graphicsCard['interface'] === interfaceType ? 1 : 0),
                  0,
              )
            : 0;
    }

    /**
     * Counts the number of used hard drive slots of specific form factors.
     * @param pcConfiguration - Current PC configuration.
     * @param formFactors - Form factors to count.
     * @returns Number of used hard drive slots.
     */
    private countUsedHardDriveSlots(
        pcConfiguration: PCConfiguration,
        ...formFactors: string[]
    ): number {
        return Array.isArray(pcConfiguration['InternalHardDrive'])
            ? pcConfiguration['InternalHardDrive'].reduce(
                  (acc, drive) =>
                      acc + (formFactors.includes(drive['formFactor']) ? 1 : 0),
                  0,
              )
            : 0;
    }

    /**
     * Counts the number of used M.2 slots.
     * @param pcConfiguration - Current PC configuration.
     * @param m2Slots - Array of M.2 slots.
     * @returns Number of used M.2 slots.
     */
    private countUsedM2Slots(
        pcConfiguration: PCConfiguration,
        m2Slots: string[],
    ): number {
        return Array.isArray(pcConfiguration['InternalHardDrive'])
            ? pcConfiguration['InternalHardDrive'].reduce((acc, drive) => {
                  if (drive['formFactor'].startsWith('M.2')) {
                      const slotIndex = m2Slots.findIndex((slot) =>
                          slot.includes(drive['formFactor']),
                      );
                      if (slotIndex !== -1) {
                          acc++;
                      }
                  }
                  return acc;
              }, 0)
            : 0;
    }

    /**
     * Checks if the motherboard has enough slots for the RAM.
     * @param pcConfiguration - Current PC configuration.
     * @param partData - Data of the RAM part.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    private async checkRAM(
        pcConfiguration: PCConfiguration,
        partData: object,
    ): Promise<boolean> {
        if (!pcConfiguration.Motherboard) {
            return true;
        }
        let availableSlots = pcConfiguration.Motherboard
            ? pcConfiguration.Motherboard['memorySlots']
            : 1;
        // Reduce the available slots by the number of RAM sticks already installed
        if (Array.isArray(pcConfiguration['RAM'])) {
            for (const ram of pcConfiguration['RAM']) {
                availableSlots -= ram['moduleNumber'];
            }
        }

        let availableMemorySupported = pcConfiguration.Motherboard
            ? pcConfiguration.Motherboard['memoryMax']
            : 1;
        // Reduce the available memory by the memory already installed
        if (Array.isArray(pcConfiguration['RAM'])) {
            for (const ram of pcConfiguration['RAM']) {
                availableMemorySupported -= ram['moduleSize'];
            }
        }
        return (
            partData['moduleNumber'] <= availableSlots &&
            partData['moduleSize'] <= availableMemorySupported
        );
    }

    /**
     * Checks if the selected graphics card is compatible with the motherboard.
     * @param pcConfiguration - Current PC configuration.
     * @param partData - Data of the graphics card part.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    private async checkGraphicsCard(
        pcConfiguration: PCConfiguration,
        partData: object,
    ): Promise<boolean> {
        if (!pcConfiguration.Motherboard) {
            return true;
        }

        const graphicsCardInterface = partData['interface'];
        const slotTypeMap = {
            PCI: 'pciSlots',
            'PCIe x1': 'pcieX1Slots',
            'PCIe x4': 'pcieX4Slots',
            'PCIe x8': 'pcieX8Slots',
            'PCIe x16': 'pcieX16Slots',
        };

        const isMotherboardHasSlot = pcConfiguration.Motherboard
            ? slotTypeMap[graphicsCardInterface] in pcConfiguration.Motherboard
            : false;

        if (!isMotherboardHasSlot) {
            return false;
        }

        let availableSlots =
            pcConfiguration.Motherboard[slotTypeMap[graphicsCardInterface]] ||
            0;

        // Reduce the available slots by the number of Graphics Cards already installed
        if (!Array.isArray(pcConfiguration['GraphicsCard'])) {
            return true;
        }
        for (const graphicsCard of pcConfiguration['GraphicsCard']) {
            if (graphicsCard['interface'] === graphicsCardInterface) {
                availableSlots -= graphicsCard['slotNumber'];
            }
        }

        return partData['slotNumber'] <= availableSlots;
    }

    /**
     * Checks if the selected internal hard drive is compatible with the motherboard.
     * @param pcConfiguration - Current PC configuration.
     * @param partData - Data of the internal hard drive part.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    private async checkInternalHardDrive(
        pcConfiguration: PCConfiguration,
        partData: object,
    ): Promise<boolean> {
        if (!pcConfiguration.Motherboard) {
            return true;
        }

        const sataSlots = pcConfiguration.Motherboard
            ? pcConfiguration.Motherboard['sata6Gbps'] -
              this.countUsedHardDriveSlots(pcConfiguration, '2.5', '3.5')
            : 0;

        const mSataSlots = pcConfiguration.Motherboard['msataSlots']
            ? pcConfiguration.Motherboard['msataSlots'] -
              this.countUsedHardDriveSlots(pcConfiguration, 'mSATA')
            : 0;
        const m2Slots = pcConfiguration.Motherboard['m2Slots']
            ? pcConfiguration.Motherboard['m2Slots'].length -
              this.countUsedM2Slots(
                  pcConfiguration,
                  pcConfiguration.Motherboard['m2Slots'],
              )
            : 0;

        const isEnoughInternalHardDriveSlots =
            partData['formFactor'] === '2.5' || partData['formFactor'] === '3.5'
                ? sataSlots > 0
                : partData['formFactor'] === 'mSATA'
                  ? mSataSlots > 0
                  : m2Slots > 0;

        return isEnoughInternalHardDriveSlots;
    }

    /**
     * Dynamically checks compatibility of a part with the PC configuration.
     * @param param0 - Object containing part data and label.
     * @param pcConfiguration - Current PC configuration.
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    private async dynamicCheckCompatibility(
        { partData, label }: { partData: object; label: string },
        pcConfiguration: PCConfiguration,
    ): Promise<boolean> {
        const checkFunctions = {
            InternalHardDrive: this.checkInternalHardDrive,
            GraphicsCard: this.checkGraphicsCard,
            RAM: this.checkRAM,
            Motherboard: this.checkMotherboard,
            PowerSupply: this.checkPowerSupply,
        };

        const checkFunction = checkFunctions[label];
        return checkFunction
            ? checkFunction.call(this, pcConfiguration, partData)
            : true;
    }

    /**
     * Checks compatibility of a part with the PC configuration.
     * @param param0 - Object containing part data and label.
     * @param pcConfiguration - Current PC configuration.
     * @param skipNeo4j - If true, skip Neo4j compatibility check (for partial configuration builds).
     * @returns Promise resolving to a boolean indicating compatibility.
     */
    public async checkCompatibility(
        { partData, label }: { partData: object; label: string },
        pcConfiguration: PCConfiguration,
        skipNeo4j: boolean = false,
    ): Promise<boolean> {
        this.updateTotalWattage(pcConfiguration); // Update total wattage
        const isDynamicCompatible = await this.dynamicCheckCompatibility(
            { partData, label },
            pcConfiguration,
        );
        if (!isDynamicCompatible) {
            return false;
        }

        if (skipNeo4j) {
            return true;
        }
        const isNeo4jCompatible = await this.neo4jCheckCompatibility(
            { name: partData['name'], label },
            pcConfiguration,
        );
        if (!isNeo4jCompatible) {
            return false;
        }
        return true;
    }
}
