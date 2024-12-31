import { Injectable } from '@nestjs/common';
import { Neo4jConfigService } from 'config/neo4j.config';

@Injectable()
export class ManualBuildService {
    constructor(private readonly neo4jConfigService: Neo4jConfigService) {}

    private async runQuery(query: string, params: Record<string, any>) {
        const session = this.neo4jConfigService.getDriver().session();
        try {
            return await session.run(query, params);
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
        return this.runQuery(query, { name, otherPartTypeName });
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
        return this.runQuery(query, { name, label });
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

        const result = await this.runQuery(query, params);
        return result.records.length > 0;
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

        const result = await this.runQuery(query, params);

        const compatibleParts = {};
        result.records.forEach((record) => {
            const type = record.get('type')[0];
            const part = record.get('compatible').properties;
            if (!compatibleParts[type]) {
                compatibleParts[type] = [];
            }
            compatibleParts[type].push(part);
        });

        return compatibleParts;
    }

    async getSpecificPartTypeCompatibleWithSelectedParts(
        selectedParts: { name: string; label: string }[],
        targetLabel: string,
    ): Promise<any[]> {
        const filteredSelectedParts = [];
        for (const part of selectedParts) {
            const query = `
        MATCH (a:${part.label})-[:COMPATIBLE_WITH]-(b:${targetLabel})
        RETURN count(b) > 0 AS isRelated
      `;
            const result = await this.runQuery(query, {});
            const isRelated = result.records[0].get('isRelated');
            if (isRelated) {
                filteredSelectedParts.push(part);
            }
        }

        if (filteredSelectedParts.length === 0) {
            const allPartsQuery = `
        MATCH (compatible:${targetLabel})
        RETURN compatible
      `;
            const result = await this.runQuery(allPartsQuery, {});
            return result.records.map(
                (record) => record.get('compatible').properties,
            );
        }

        const matchStatements = filteredSelectedParts
            .map(
                (part, index) => `
        MATCH (selected${index}:${part.label} {name: $selectedId${index}})-[:COMPATIBLE_WITH]-(compatible:${targetLabel})
        `,
            )
            .join(' ');

        const params = filteredSelectedParts.reduce(
            (acc, part, index) => ({
                ...acc,
                [`selectedId${index}`]: part.name,
            }),
            {},
        );

        const query = `
      ${matchStatements}
      RETURN DISTINCT compatible
    `;

        const result = await this.runQuery(query, params);
        return result.records.map(
            (record) => record.get('compatible').properties,
        );
    }
}
