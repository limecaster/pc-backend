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
import { CloudinaryModule } from '../config/cloudinary.module';
import { RatingModule } from './rating/rating.module';
import { PCConfigurationModule } from './pc-configuration/pc-configuration.module';
import { AccountModule } from './dashboard/account/account.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
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
                synchronize: true, // Set to false in production
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
    ],
    controllers: [
        AppController,
        BuildController,
        ChatbotController,
        ProductController,
    ],
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
    ],
})
export class AppModule {}
