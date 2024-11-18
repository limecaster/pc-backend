import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver } from 'neo4j-driver';

@Injectable()
export class Neo4jConfigService {
  private driver: Driver;

  constructor(private configService: ConfigService) {
    this.driver = neo4j.driver(
      this.configService.get<string>('NEO4J_URI'),
      neo4j.auth.basic(
        this.configService.get<string>('NEO4J_USER'),
        this.configService.get<string>('NEO4J_PASSWORD'),
      ),
    );
  }

  getDriver(): Driver {
    return this.driver;
  }
}
