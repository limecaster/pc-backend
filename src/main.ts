/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as bodyParser from 'body-parser';
import { MicroserviceOptions } from '@nestjs/microservices';
import { getKafkaConfig } from './events/kafka/kafka.config';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

// Load the appropriate environment file based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env${nodeEnv !== 'development' ? `.${nodeEnv}` : ''}`;
const envPath = path.resolve(process.cwd(), envFile);

if (fs.existsSync(envPath)) {
    console.log(`Loading environment from ${envPath}`);
    dotenv.config({ path: envPath });
} else {
    console.log(`Environment file ${envPath} not found, using .env`);
    dotenv.config();
}

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug'], // Enable all log levels in development
    });

    const allowedOrigins = ['*', 'http://192.168.1.28:3000', 'http://localhost:3000'];
    if (process.env.FRONTEND_URL) {
        allowedOrigins.push(process.env.FRONTEND_URL);
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
    app.useWebSocketAdapter(new WsAdapter(app));
    app.useWebSocketAdapter(new IoAdapter(app));

    const configService = app.get(ConfigService);

    // Connect Kafka microservice
    const kafkaConfig = getKafkaConfig(configService);
    app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
    await app.startAllMicroservices();

    const port = process.env.PORT ?? 3001;
    await app.listen(port);
    logger.debug(`Application listening on port ${port} in ${nodeEnv} mode`);
}
bootstrap();
