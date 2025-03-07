import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BuildController } from './build/build.controller';
import { ManualBuildService } from 'src/build/manual-build.service';
import { Neo4jConfigService } from 'config/neo4j.config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AutoBuildService } from 'src/build/auto-build.service';
import { SpacyService } from 'src/build/spacy.service';
import { CheckCompatibilityService } from 'src/build/check-compatibility.service';
import { UtilsService } from 'service/utils.service';
import { BuildGateway } from 'gateway/build.gateway';
import { ChatbotController } from 'src/chatbot/chatbot.controller';
import { ChatbotService } from 'src/chatbot/chatbot.service';
import { PostgresConfigService } from 'config/postgres.config';
import { ProductModule } from './product/product.module';
import { ProductController } from './product/product.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ProductModule,
  ],
  controllers: [AppController, BuildController, ChatbotController, ProductController],
  providers: [
    AppService,
    ManualBuildService,
    AutoBuildService,
    CheckCompatibilityService,
    SpacyService,
    Neo4jConfigService,
    PostgresConfigService,
    ConfigService,
    UtilsService,
    ChatbotService,
    BuildGateway
  ],
})
export class AppModule {}
