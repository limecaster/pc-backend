import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BuildController } from './build/build.controller';
import { ManualBuildService } from './build/manual-build.service';
import { Neo4jConfigService } from './config/neo4j.config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AutoBuildService } from './build/auto-build.service';
import { SpacyService } from './build/spacy.service';
import { CheckCompatibilityService } from './build/check-compatibility.service';
import { UtilsService } from './service/utils.service';
import { BuildGateway } from './gateway/build.gateway';
import { ChatbotController } from './chatbot/chatbot.controller';
import { ChatbotService } from './chatbot/chatbot.service';
import { PostgresConfigService } from './config/postgres.config';
import { ProductModule } from './product/product.module';
import { PaymentModule } from './payment/payment.module';
import { AuthModule } from './auth/auth.module';
import { CustomerModule } from './customer/customer.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from './email/email.module';
import { CartModule } from './cart/cart.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrderModule } from './order/order.module';
import { CloudinaryModule } from './config/cloudinary.module';
import { RatingModule } from './rating/rating.module';
import { PCConfigurationModule } from './pc-configuration/pc-configuration.module';
import { AccountModule } from './dashboard/account/account.module';
import { DiscountModule } from './discount/discount.module';
import { EventsModule } from './events/events.module';
import { CmsModule } from './cms/cms.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FAQModule } from './faq/faq.module';
import * as Joi from 'joi';
import { BuildStateService } from './build/build-state.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
            validationSchema: Joi.object({
                ML_API_URL: Joi.string().default('http://localhost:8003'),
            }),
        }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get('POSTGRES_HOST', 'localhost'),
                port: configService.get<number>('POSTGRES_PORT', 5432),
                username: configService.get('POSTGRES_USER', 'postgres'),
                password: configService.get('POSTGRES_PASSWORD', 'postgres'),
                database: configService.get('POSTGRES_NAME', 'pc_ecommerce'),
                entities: [
                    /* Manually specify entities here if autoLoadEntities is false */
                ],
                autoLoadEntities: true,
                synchronize: configService.get('IS_IN_PRODUCTION', false), // Notice to set to false in production
            }),
        }),
        ProductModule,
        PaymentModule,
        AuthModule,
        CustomerModule,
        EmailModule,
        CartModule,
        DashboardModule,
        WishlistModule,
        CheckoutModule,
        OrderModule,
        CloudinaryModule,
        RatingModule,
        PCConfigurationModule,
        AccountModule,
        DiscountModule,
        EventsModule,
        CmsModule,
        AnalyticsModule,
        FAQModule,
    ],
    controllers: [AppController, BuildController, ChatbotController],
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
        BuildGateway,
        BuildStateService,
    ],
})
export class AppModule {}
