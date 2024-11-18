import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BuildController } from 'controller/build.controller';
import { ManualBuildService } from 'service/manual-build.service';
import { Neo4jConfigService } from 'config/neo4j.config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AutoBuildService } from 'service/auto-build.service';
import { SpacyService } from 'service/spacy.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, BuildController],
  providers: [
    AppService,
    ManualBuildService,
    AutoBuildService,
    SpacyService,
    Neo4jConfigService,
    ConfigService,
  ],
})
export class AppModule {}
