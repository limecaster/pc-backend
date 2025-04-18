import { Injectable } from '@nestjs/common';
import { PostgresConfigService } from 'src/config/postgres.config';
import { Neo4jConfigService } from 'src/config/neo4j.config';
@Injectable()
export class AppService {
    constructor(
        private postgresConfigService: PostgresConfigService,
        private neo4jConfigService: Neo4jConfigService,
    ) {}
    getHello(): string {
        this.testConnection();
        this.testNeo4jConnection();
        return 'Hello World!';
    }
    // Test the connection to the database
    async testConnection(): Promise<string> {
        const pool = this.postgresConfigService.getPool();
        const result = await pool.query('SELECT current_database()');
        return result.rows[0];
    }

    async testNeo4jConnection(): Promise<string> {
        const driver = this.neo4jConfigService.getDriver();
        const session = driver.session();
        const result = await session.run('MATCH (n) RETURN count(n) AS count');
        return result.records[0].get('count');
    }
}
