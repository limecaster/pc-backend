import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Neo4jConfigService } from './neo4j.config';

@Module({
    imports: [ConfigModule],
    providers: [Neo4jConfigService],
    exports: [Neo4jConfigService],
})
export class Neo4jModule {}
