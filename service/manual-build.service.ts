import { Injectable } from '@nestjs/common';
import { Neo4jConfigService } from 'config/neo4j.config';

@Injectable()
export class ManualBuildService {
  constructor(private readonly neo4jConfigService: Neo4jConfigService) {}

  async findCompatipleParts(name: string, otherPartTypeName: string) {
    const session = this.neo4jConfigService.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (p:CPU {name: \'${name}\' })-[r:COMPATIBLE_WITH]->(other:${otherPartTypeName})
         RETURN p, collect(other)
         LIMIT 100;`,
        { name, otherPartTypeName },
      );
      return result;
    } finally {
      await session.close();
    }
  }

  async getCompatiblePartsByLabel(name: string, label: string) {
    const session = this.neo4jConfigService.getDriver().session();
    try {
      const result = await session.run(
        `CALL apoc.cypher.run(
          'MATCH (p {name: \"${name}\"})-[:COMPATIBLE_WITH]->(compatible)
            RETURN compatible',
            {name: $name}
          ) YIELD value
          RETURN value.compatible`,
        { name, label },
      );
      return result;
    } finally {
      await session.close();
    }
  }

  async checkCompatibilityAcrossLabels(
    newPartName: string,
    newPartLabel: string,
    selectedParts: { name: string; label: string }[],
  ): Promise<boolean> {
    const session = this.neo4jConfigService.getDriver().session();
    const matchStatements = selectedParts
      .map(
        (part, index) =>
          `MATCH (newPart)-[:COMPATIBLE_WITH]-(selected${index}:${part.label} {name: $selectedId${index}})`,
      )
      .join(' ');

    // Build params for each selected part name
    const params = selectedParts.reduce(
      (acc, part, index) => ({ ...acc, [`selectedId${index}`]: part.name }),
      { newPartName },
    );

    // Construct the full query with multiple MATCH clauses
    const query = `
    MATCH (newPart:${newPartLabel} {name: $newPartName})
    ${matchStatements}
    RETURN newPart
  `;

    try {
      const result = await session.run(query, params);
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  async getAllPartTypeCompatibleWithSelectedParts(
    selectedParts: { name: string; label: string }[],
  ): Promise<any> {
    const session = this.neo4jConfigService.getDriver().session();

    // Construct MATCH statements for each selected part
    const matchStatements = selectedParts
      .map(
        (part, index) =>
          `MATCH (selected${index}:${part.label} {name: $selectedId${index}})-[:COMPATIBLE_WITH]-(compatible)`,
      )
      .join(' ');

    // Construct parameters for each selected part
    const params = selectedParts.reduce(
      (acc, part, index) => ({ ...acc, [`selectedId${index}`]: part.name }),
      {},
    );

    // Cypher query to find all compatible parts across types
    const query = `
      ${matchStatements}
      RETURN DISTINCT labels(compatible) AS type, compatible
    `;
    try {
      const result = await session.run(query, params);

      // Process results to group compatible parts by type
      const compatibleParts = {};
      result.records.forEach((record) => {
        const type = record.get('type')[0]; // Get the primary label/type of the compatible part
        const part = record.get('compatible').properties;
        if (!compatibleParts[type]) {
          compatibleParts[type] = [];
        }
        compatibleParts[type].push(part);
      });

      return compatibleParts;
    } finally {
      await session.close();
    }
  }

  async getSpecificPartTypeCompatibleWithSelectedParts(
    selectedParts: { name: string; label: string }[],
    targetLabel: string,
  ): Promise<any[]> {
    const session = this.neo4jConfigService.getDriver().session();

    // Step 1: Filter selectedParts to only those labels with a COMPATIBLE_WITH relationship with targetLabel
    const filteredSelectedParts = [];
    for (const part of selectedParts) {
      const query = `
        MATCH (a:${part.label})-[:COMPATIBLE_WITH]-(b:${targetLabel})
        RETURN count(b) > 0 AS isRelated
      `;
      const result = await session.run(query);
      const isRelated = result.records[0].get('isRelated');
      if (isRelated) {
        filteredSelectedParts.push(part);
      }
    }

    // Step 2: If no filtered selected parts require compatibility checks, return all targetLabel parts
    if (filteredSelectedParts.length === 0) {
      const allPartsQuery = `
        MATCH (compatible:${targetLabel})
        RETURN compatible
      `;
      const result = await session.run(allPartsQuery);
      return result.records.map(
        (record) => record.get('compatible').properties,
      );
    }

    // Step 3: Otherwise, proceed with compatibility check across filtered selected parts
    const matchStatements = filteredSelectedParts
      .map(
        (part, index) => `
        MATCH (selected${index}:${part.label} {name: $selectedId${index}})-[:COMPATIBLE_WITH]-(compatible:${targetLabel})
        `,
      )
      .join(' ');

    const params = filteredSelectedParts.reduce(
      (acc, part, index) => ({ ...acc, [`selectedId${index}`]: part.name }),
      {},
    );

    const query = `
      ${matchStatements}
      RETURN DISTINCT compatible
    `;

    try {
      const result = await session.run(query, params);
      console.log(result.records.length);
      return result.records.map(
        (record) => record.get('compatible').properties,
      );
    } finally {
      await session.close();
    }
  }
}
