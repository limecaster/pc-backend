import { Injectable, Logger } from '@nestjs/common';
import { Neo4jConfigService } from 'src/config/neo4j.config';
import { UtilsService } from '../service/utils.service';
import { CheckCompatibilityService } from './check-compatibility.service';
import { PCConfiguration } from 'src/build/dto/auto-build.dto';

@Injectable()
export class ManualBuildService {
    private readonly logger = new Logger(ManualBuildService.name);

    constructor(
        private readonly neo4jConfigService: Neo4jConfigService,
        private readonly utilsService: UtilsService,
        private readonly checkCompatibilityService: CheckCompatibilityService,
    ) {}

    private async runQuery(query: string, params: Record<string, any>) {
        const session = this.neo4jConfigService.getDriver().session();
        try {
            return await session.run(query, params);
        } catch (error) {
            this.logger.error(`Error running query: ${query}`, error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async findCompatibleParts(name: string, otherPartTypeName: string) {
        const query = `
      MATCH (p:CPU {name: $name})-[r:COMPATIBLE_WITH]->(other:${otherPartTypeName})
      RETURN p, collect(other)
      LIMIT 100;
    `;
        try {
            return await this.runQuery(query, { name, otherPartTypeName });
        } catch (error) {
            this.logger.error('Error finding compatible parts:', error);
            throw new Error('Failed to find compatible parts');
        }
    }

    async getCompatiblePartsByLabel(name: string, label: string) {
        const query = `
      CALL apoc.cypher.run(
        'MATCH (p {name: $name})-[:COMPATIBLE_WITH]->(compatible)
         RETURN compatible',
        {name: $name}
      ) YIELD value
      RETURN value.compatible
    `;
        try {
            return await this.runQuery(query, { name, label });
        } catch (error) {
            this.logger.error(
                'Error getting compatible parts by label:',
                error,
            );
            throw new Error('Failed to get compatible parts by label');
        }
    }

    async checkCompatibilityAcrossLabels(
        newPartName: string,
        newPartLabel: string,
        selectedParts: { name: string; label: string }[],
    ): Promise<boolean> {
        const matchStatements = selectedParts
            .map(
                (part, index) =>
                    `MATCH (newPart)-[:COMPATIBLE_WITH]-(selected${index}:${part.label} {name: $selectedId${index}})`,
            )
            .join(' ');

        const params = selectedParts.reduce(
            (acc, part, index) => ({
                ...acc,
                [`selectedId${index}`]: part.name,
            }),
            { newPartName },
        );

        const query = `
      MATCH (newPart:${newPartLabel} {name: $newPartName})
      ${matchStatements}
      RETURN newPart
    `;

        try {
            const result = await this.runQuery(query, params);
            return result.records.length > 0;
        } catch (error) {
            this.logger.error(
                'Error checking compatibility across labels:',
                error,
            );
            throw new Error('Failed to check compatibility across labels');
        }
    }

    async getAllPartTypeCompatibleWithSelectedParts(
        selectedParts: { name: string; label: string }[],
    ): Promise<any> {
        const matchStatements = selectedParts
            .map(
                (part, index) =>
                    `MATCH (selected${index}:${part.label} {name: $selectedId${index}})-[:COMPATIBLE_WITH]-(compatible)`,
            )
            .join(' ');

        const params = selectedParts.reduce(
            (acc, part, index) => ({
                ...acc,
                [`selectedId${index}`]: part.name,
            }),
            {},
        );

        const query = `
      ${matchStatements}
      RETURN DISTINCT labels(compatible) AS type, compatible
    `;

        try {
            const result = await this.runQuery(query, params);

            const compatibleParts: Record<string, any[]> = {};
            result.records.forEach((record) => {
                const type = record.get('type')[0];
                const part = record.get('compatible').properties;
                if (!compatibleParts[type]) {
                    compatibleParts[type] = [];
                }
                compatibleParts[type].push(part);
            });

            return compatibleParts;
        } catch (error) {
            this.logger.error(
                'Error getting all part type compatible with selected parts:',
                error,
            );
            throw new Error('Failed to get part type compatibility');
        }
    }

    async getSpecificPartTypeCompatibleWithSelectedParts(
        selectedParts: { name: string; label: string; neo4jLabels: string[] }[],
        targetLabel: string,
        searchTerm?: string,
        sortOption?: 'name' | 'price-asc' | 'price-desc',
    ): Promise<any[]> {
        try {
            // First, map the target label to a Neo4j label
            const mappedTargetLabel =
                targetLabel === 'SSD' || targetLabel === 'HDD'
                    ? 'InternalHardDrive'
                    : targetLabel;

            // Store the original target label for later use in specific filtering
            const originalTargetLabel = targetLabel;

            // Filter selected parts based on whether they have relationships with the target label
            const filteredSelectedParts = await Promise.all(
                selectedParts.map(async (part) => {
                    const indexName = `${part.neo4jLabels[0]}NameFulltextIndex`;
                    let query = `
                    CALL db.index.fulltext.queryNodes($indexName, $partname)
                    YIELD node, score
                    MATCH (node)-[:COMPATIBLE_WITH]-(b:${mappedTargetLabel})
                    RETURN count(b) > 0 AS isRelated
                    `;
                    const sanitizedPartname = part.name.replace(
                        /[+\-\/():"]/g,
                        '\\$&',
                    );
                    const result = await this.runQuery(query, {
                        indexName,
                        partname: sanitizedPartname,
                    });
                    const isRelated = result.records[0].get('isRelated');
                    return isRelated ? part : null;
                }),
            ).then((parts) => parts.filter((part) => part !== null));

            // Case: No selected parts yet - show all compatible parts of the requested type
            if (filteredSelectedParts.length === 0) {
                let query = `
                MATCH (compatible:${mappedTargetLabel})
                WHERE compatible.price IS NOT NULL AND toFloat(compatible.price) > 0
                `;

                // Add storage type filtering for SSD and HDD
                if (originalTargetLabel === 'SSD') {
                    // Filter for SSD storage type
                    query += `
                    AND compatible.type = 'SSD'
                    `;
                } else if (originalTargetLabel === 'HDD') {
                    // Filter for non-SSD storage types
                    query += `
                    AND (compatible.type <> 'SSD' OR compatible.type IS NULL)
                    `;
                }

                if (searchTerm) {
                    query += `
                    AND toLower(compatible.name) CONTAINS toLower($searchTerm)
                    `;
                }

                if (sortOption) {
                    switch (sortOption) {
                        case 'name':
                            query += 'ORDER BY compatible.name';
                            break;
                        case 'price-asc':
                            query += 'ORDER BY compatible.price';
                            break;
                        case 'price-desc':
                            query += 'ORDER BY compatible.price DESC';
                            break;
                    }
                }

                query += `
                RETURN compatible
                `;

                const params: Record<string, any> = {};
                if (searchTerm) {
                    params.searchTerm = searchTerm;
                }

                const result = await this.runQuery(query, params);
                return result.records.map((record) =>
                    this.normalizeProperties(
                        record.get('compatible').properties,
                    ),
                );
            }

            // Case: We have selected parts - find parts compatible with the selection
            const matchStatements = filteredSelectedParts
                .map(
                    (part, index) => `
                MATCH (selected${index}:${part.neo4jLabels[0]} {name: $selectedId${index}})-[:COMPATIBLE_WITH]-(compatible:${mappedTargetLabel})
                `,
                )
                .join(' ');

            const whereConditions = [
                'compatible.price IS NOT NULL',
                'toFloat(compatible.price) > 0',
            ];

            // Add storage type filtering for SSD and HDD
            if (originalTargetLabel === 'SSD') {
                whereConditions.push("compatible.type = 'SSD'");
            } else if (originalTargetLabel === 'HDD') {
                whereConditions.push(
                    "(compatible.type <> 'SSD' OR compatible.type IS NULL)",
                );
            }

            if (searchTerm) {
                whereConditions.push(
                    'toLower(compatible.name) CONTAINS toLower($searchTerm)',
                );
            }

            const whereClause =
                whereConditions.length > 0
                    ? `WHERE ${whereConditions.join(' AND ')} `
                    : '';

            let orderByClause = '';
            if (sortOption) {
                switch (sortOption) {
                    case 'name':
                        orderByClause = 'ORDER BY compatible.name';
                        break;
                    case 'price-asc':
                        orderByClause = 'ORDER BY compatible.price';
                        break;
                    case 'price-desc':
                        orderByClause = 'ORDER BY compatible.price DESC';
                        break;
                }
            }

            const params = filteredSelectedParts.reduce(
                (acc, part, index) => ({
                    ...acc,
                    [`selectedId${index}`]: part.name,
                }),
                {} as Record<string, any>,
            );
            if (searchTerm) {
                params.searchTerm = searchTerm;
            }

            const query = `
            ${matchStatements}
            ${whereClause}
            RETURN DISTINCT compatible
            ${orderByClause}
            `;

            const result = await this.runQuery(query, params);
            return result.records.map((record) =>
                this.normalizeProperties(record.get('compatible').properties),
            );
        } catch (error) {
            this.logger.error(
                'Error getting specific part type compatible with selected parts:',
                error,
            );
            throw new Error(
                'Failed to get specific part type compatible with selected parts',
            );
        }
    }

    private normalizeProperties(properties: any): any {
        const normalized = { ...properties };
        for (const key in normalized) {
            if (
                normalized[key] &&
                typeof normalized[key] === 'object' &&
                'low' in normalized[key] &&
                'high' in normalized[key]
            ) {
                normalized[key] = this.utilsService.combineLowHigh(
                    normalized[key].low,
                    normalized[key].high,
                );
            }
        }
        return normalized;
    }

    async findAllPartsByLabels(labels: string[]): Promise<any[]> {
        try {
            const query = `
                MATCH (part)
                WHERE any(label IN labels(part) WHERE label IN $labels)
                RETURN part
            `;
            const result = await this.runQuery(query, { labels });
            return result.records.map((record) =>
                this.normalizeProperties(record.get('part').properties),
            );
        } catch (error) {
            this.logger.error('Error finding parts by labels:', error);
            throw new Error('Failed to find parts by labels');
        }
    }

    async findAllPartsByLabelsPaginated(
        labels: string[],
        page: number,
        limit: number,
    ): Promise<{ items: any[]; totalItems: number }> {
        try {
            const skip = (page - 1) * limit;
            const query = `
                MATCH (part)
                WHERE any(label IN labels(part) WHERE label IN $labels)
                RETURN part
                SKIP toInteger($skip)
                LIMIT toInteger($limit)
            `;
            const countQuery = `
                MATCH (part)
                WHERE any(label IN labels(part) WHERE label IN $labels)
                RETURN count(part) as totalItems
            `;

            const result = await this.runQuery(query, { labels, skip, limit });
            const countResult = await this.runQuery(countQuery, { labels });

            const items = result.records.map((record) =>
                this.normalizeProperties(record.get('part').properties),
            );

            const totalItems = this.utilsService.combineLowHigh(
                countResult.records[0].get('totalItems').low,
                countResult.records[0].get('totalItems').high,
            );

            return { items, totalItems };
        } catch (error) {
            this.logger.error(
                'Error finding parts by labels with pagination:',
                error,
            );
            throw new Error('Failed to find parts by labels with pagination');
        }
    }

    private pcConfigurationForManualBuild: any = {};

    async checkPartCompatibilityWithSelected(
        partName: string,
        partLabels: string[],
    ) {
        try {
            const indexName = `${partLabels[0]}NameFulltextIndex`;
            const query = `
                CALL db.index.fulltext.queryNodes($indexName, $partname)
                YIELD node, score
                RETURN node
            `;
            const sanitizedPartname = partName.replace(/[+\-\/():"]/g, '\\$&');
            const result = await this.runQuery(query, {
                indexName,
                partname: sanitizedPartname,
            });
            let partRecord = this.normalizeProperties(
                result.records[0].get('node').properties,
            );

            if (!partRecord) {
                throw new Error(`Part with name ${partName} not found`);
            }

            for (const label of partLabels) {
                const isCompatible =
                    await this.checkCompatibilityService.checkCompatibility(
                        { partData: partRecord, label },
                        this.pcConfigurationForManualBuild,
                    );
                if (!isCompatible) {
                    return false;
                }
            }
            this.pcConfigurationForManualBuild[partLabels[0]] = partRecord;
            return true;
        } catch (error) {
            this.logger.error('Error checking part compatibility:', error);
            throw new Error('Failed to check part compatibility');
        }
    }
}
