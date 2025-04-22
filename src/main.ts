/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { MicroserviceOptions } from '@nestjs/microservices';
import { getKafkaConfig } from './events/kafka/kafka.config';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug'], // Enable all log levels in development
    });

    const configService = app.get(ConfigService);

    // Configure CORS
    const allowedOrigins = [
        'https://bpcstore.me',
        'https://www.bpcstore.me',
        'http://localhost', // For local dev
        'http://192.168.1.28:3000',
        'http://pc_frontend:3000'
    ];
    if (configService.get('FRONTEND_URL')) {
        allowedOrigins.push(configService.get('FRONTEND_URL'));
    }

    if (configService.get('AI_EXTRACTOR_URL')) {
        allowedOrigins.push(configService.get('AI_EXTRACTOR_URL'));
    }

    if (configService.get('CHATBOT_API_URL')) {
        allowedOrigins.push(configService.get('CHATBOT_API_URL'));
    }

    if (configService.get('ML_API_URL')) {
        allowedOrigins.push(configService.get('ML_API_URL'));
    }

    logger.log(`Configuring CORS for origins: ${allowedOrigins.join(', ')}`);

    app.enableCors({
        origin: allowedOrigins,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
        allowedHeaders:
            'Origin,X-Requested-With,Content-Type,Accept,Authorization,X-Session-Id',
        exposedHeaders: 'Authorization',
    });

    app.useGlobalPipes(
        new ValidationPipe({
            transform: true, // Enable automatic type transformation
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );

    // Configure file size limits for uploads
    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

    // Add health check endpoint for Docker
    app.use('/health', (req, res) => {
        res.status(200).send('OK');
    });

    // WebSocket adapters
    // app.useWebSocketAdapter(new WsAdapter(app)); // Removed: Only use IoAdapter for Socket.IO
    app.useWebSocketAdapter(new IoAdapter(app));
    // Connect Kafka microservice
    const kafkaConfig = getKafkaConfig(configService);
    app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
    await app.startAllMicroservices();

    const port = process.env.PORT ?? 3001;
    await app.listen(port);
    logger.debug(`Application listening on port ${port} in ${configService.get('NODE_ENV')} mode`);
}
bootstrap();
